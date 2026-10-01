"use client";

import { createClient } from "@/lib/supabase/client";
import {
  db, CLAVE_DELIVERY_CONFIG,
  type DeliveryConfigLocal, type DeliveryPedidoLocal, type OrdenItemLocal, type RepartidorLocal,
} from "@/lib/offline/db";
import { enviarACocina } from "@/lib/pos/acciones";
import { leerConfigFiscal, emitirDocumentoFiscal, lineasDesdeItems, verificarPuedeFacturar } from "@/lib/fiscal/emision";
import { emitirNotaCredito } from "@/lib/fiscal/notasCredito";
import { imprimirDocumentoFiscal } from "@/lib/fiscal/impresion";
import type { LineaFiscal, TasaIsv } from "@/lib/fiscal/impuestos";
import { servicioImpresion } from "@/lib/printing/enviarComanda";
import { construirComprobanteEntrega } from "@/lib/printing/comprobanteEntrega";
import type { ResultadoImpresion } from "@/lib/printing/types";
import { ETIQUETA_METODO, type MetodoPago } from "./validaciones";

/**
 * Acciones del restaurante sobre los pedidos de delivery. Las transiciones de
 * estado las valida SIEMPRE el servidor (trigger fn_delivery_antes_update); aquí
 * solo se piden y se muestra el error si lo rechaza. La factura se emite en la
 * caja (Dexie, con el correlativo del punto de emisión de ESTA caja) exactamente
 * igual que en un cobro, así que respeta los mismos bloqueos del módulo CAI.
 */

export const ESTADOS_ACTIVOS = ["recibido", "aceptado", "en_cocina", "listo", "en_camino"] as const;

// --- lógica pura ------------------------------------------------------------

/** Pedidos que un repartidor lleva "en la calle" (listo para salir o ya en camino). */
export function pedidosActivosDe(repartidorId: string, pedidos: Pick<DeliveryPedidoLocal, "repartidor_id" | "estado_delivery">[]) {
  return pedidos.filter((p) => p.repartidor_id === repartidorId && (p.estado_delivery === "listo" || p.estado_delivery === "en_camino")).length;
}

/** Sugiere al repartidor activo con MENOS pedidos activos (empate: el que tenga menos entregas hechas hoy no se sabe aquí, gana el primero por nombre). */
export function sugerirRepartidor(
  repartidores: Pick<RepartidorLocal, "id" | "nombre" | "activo">[],
  pedidos: Pick<DeliveryPedidoLocal, "repartidor_id" | "estado_delivery">[]
): string | null {
  const candidatos = repartidores.filter((r) => r.activo).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  let mejor: { id: string; n: number } | null = null;
  for (const r of candidatos) {
    const n = pedidosActivosDe(r.id, pedidos);
    if (!mejor || n < mejor.n) mejor = { id: r.id, n };
  }
  return mejor?.id ?? null;
}

export const NOMBRE_LINEA_ENVIO = "Servicio de envío a domicilio";

/** Líneas de la factura: los ítems del pedido + el envío como línea propia con su tasa de ISV. */
export function lineasFacturaDelivery(items: OrdenItemLocal[], tarifaEnvio: number, tasaEnvio: TasaIsv): LineaFiscal[] {
  const lineas = lineasDesdeItems(items);
  if (tarifaEnvio > 0) {
    lineas.push({ nombre: NOMBRE_LINEA_ENVIO, cantidad: 1, precioUnitario: tarifaEnvio, tasa: tasaEnvio });
  }
  return lineas;
}

export const totalACobrar = (subtotal: number, tarifaEnvio: number) => Math.round((subtotal + tarifaEnvio) * 100) / 100;

// --- facturación ------------------------------------------------------------

/** Factura vigente de esta orden en el dispositivo (null si no hay). */
async function facturaVigenteLocal(ordenId: string) {
  return (await db.documentos_fiscales.where("orden_id").equals(ordenId).toArray()).find(
    (d) => d.clase === "factura" && d.estado === "emitida"
  );
}

/**
 * Emite la factura del pedido en el punto de emisión de ESTA caja.
 *  - Sin facturación fiscal activa: no emite nada (devuelve null).
 *  - Sin CAI vigente / caja sin vincular: lanza FiscalError y NO escribe nada.
 *  - Si la orden ya tiene factura vigente (reintento tras un fallo): la devuelve, no emite otra.
 *  - Consumidor Final o con RTN según lo que pidió el cliente.
 */
export async function facturarPedidoDelivery(params: { ordenId: string; usuarioId: string | null }) {
  const config = await leerConfigFiscal();
  if (!config?.activa) return null;

  const existente = await facturaVigenteLocal(params.ordenId);
  if (existente) return existente;

  const bloqueo = await verificarPuedeFacturar();
  if (bloqueo) throw bloqueo;

  const pedido = await db.delivery_pedidos.get(params.ordenId);
  const orden = await db.ordenes.get(params.ordenId);
  if (!pedido || !orden) throw new Error("No se encontró el pedido en este dispositivo.");
  const items = await db.orden_items.where("orden_id").equals(params.ordenId).toArray();
  const cfg = (await db.config.get(CLAVE_DELIVERY_CONFIG))?.valor as DeliveryConfigLocal | undefined;

  return emitirDocumentoFiscal({
    ordenId: params.ordenId,
    sucursalId: orden.sucursal_id,
    usuarioId: params.usuarioId,
    lineas: lineasFacturaDelivery(items, Number(pedido.tarifa_envio), (cfg?.tasa_isv_envio as TasaIsv | undefined) ?? "15"),
    cliente: pedido.tipo_factura === "con_rtn"
      ? { nombre: pedido.factura_nombre ?? undefined, rtn: pedido.factura_rtn ?? undefined }
      : undefined,
  });
}

// --- impresión --------------------------------------------------------------

async function urlAgente(): Promise<string | null> {
  const cfg = await db.config.get("sucursal");
  return (cfg?.valor as { agenteImpresionUrl?: string | null } | undefined)?.agenteImpresionUrl ?? null;
}

/** Imprime el comprobante de entrega. NO consume correlativo (no toca los rangos CAI). */
export async function imprimirComprobanteEntrega(ordenId: string): Promise<ResultadoImpresion> {
  const agente = await urlAgente();
  if (!agente) {
    return { ok: false, error: "Esta sucursal no tiene configurada la URL del agente de impresión (Admin > Sucursales)." };
  }
  const pedido = await db.delivery_pedidos.get(ordenId);
  const orden = await db.ordenes.get(ordenId);
  if (!pedido || !orden) return { ok: false, error: "No se encontró el pedido." };
  const items = await db.orden_items.where("orden_id").equals(ordenId).toArray();
  const factura = await facturaVigenteLocal(ordenId);
  const repartidor = pedido.repartidor_id ? await db.repartidores.get(pedido.repartidor_id) : undefined;
  const sucursal = (await db.config.get("sucursal"))?.valor as { nombre?: string } | undefined;
  const fiscal = await leerConfigFiscal();

  const subtotal = Number(orden.total);
  const instrucciones = construirComprobanteEntrega({
    restaurante: fiscal?.emisor?.nombre_comercial || sucursal?.nombre || "Restaurante",
    numeroPedido: orden.numero_dia,
    fechaHora: new Date(),
    cliente: pedido.cliente_nombre,
    telefono: pedido.cliente_telefono,
    zona: pedido.zona_nombre,
    referencia: pedido.direccion_referencia,
    items: items.map((i) => ({ cantidad: i.cantidad, nombre: i.nombre_producto })),
    subtotal,
    envio: Number(pedido.tarifa_envio),
    total: totalACobrar(subtotal, Number(pedido.tarifa_envio)),
    metodoPagoEtiqueta: ETIQUETA_METODO[pedido.metodo_pago as MetodoPago] ?? pedido.metodo_pago,
    pagaCon: pedido.metodo_pago === "efectivo" ? pedido.paga_con : null,
    facturaNumero: factura?.numero_completo ?? null,
    repartidor: repartidor?.nombre ?? null,
  });
  return servicioImpresion.enviarImpresion({ instrucciones, logoPngBase64: null }, agente);
}

// --- acciones sobre el servidor ---------------------------------------------

function mensajeServidor(mensaje: string): string {
  const m = /DELIVERY_[A-Z_]+: ([^\n]+)/.exec(mensaje);
  if (m) return m[1];
  if (/Failed to fetch|NetworkError|network/i.test(mensaje)) return "Sin conexión. Este paso necesita internet.";
  return mensaje;
}

async function actualizarPedido(ordenId: string, cambios: Record<string, unknown>) {
  const supabase = createClient();
  const { error } = await supabase.from("ordenes_delivery").update(cambios as never).eq("orden_id", ordenId);
  if (error) throw new Error(mensajeServidor(error.message));
  await db.delivery_pedidos.update(ordenId, cambios as never);
}

/** Aceptar: recibido → aceptado → en_cocina, y la comanda sale a cocina con el flujo de siempre. */
export async function aceptarPedido(ordenId: string) {
  const pedido = await db.delivery_pedidos.get(ordenId);
  if (!pedido) throw new Error("No se encontró el pedido.");
  if (pedido.estado_delivery === "recibido") await actualizarPedido(ordenId, { estado_delivery: "aceptado" });
  if (pedido.estado_delivery === "recibido" || pedido.estado_delivery === "aceptado") {
    await actualizarPedido(ordenId, { estado_delivery: "en_cocina" });
  }

  // Los ítems tienen que estar en el dispositivo para armar la comanda
  const supabase = createClient();
  const { data: items } = await supabase.from("orden_items").select("*").eq("orden_id", ordenId);
  if (items?.length) await db.orden_items.bulkPut(items);
  const orden = await db.ordenes.get(ordenId);
  if (orden && orden.estado === "abierta") await db.ordenes.update(ordenId, { estado: "enviada" });
  await enviarACocina(ordenId, `DELIVERY #${orden?.numero_dia ?? ""} ${pedido.cliente_nombre}`.trim());
}

/** Rechazar un pedido nuevo: el cliente ve el motivo en su seguimiento. */
export async function rechazarPedido(ordenId: string, motivo: string) {
  const m = motivo.trim();
  if (!m) throw new Error("Escribe el motivo del rechazo.");
  await actualizarPedido(ordenId, { estado_delivery: "rechazado", motivo_cancelacion: m });
}

export interface ResultadoDespacho {
  documentoId: string | null;
  impresion: { factura: ResultadoImpresion | null; comprobante: ResultadoImpresion };
}

/**
 * Listo / Despachar:
 *  1. factura fiscal en esta caja (si el negocio factura),
 *  2. pasa a "listo" con el repartidor asignado (valida el servidor),
 *  3. imprime la factura y 4. el comprobante de entrega.
 * Si algo falla ANTES de tocar el servidor no queda nada a medias, y si falla
 * después se puede volver a llamar: no emite una segunda factura.
 */
export async function despacharPedido(params: {
  ordenId: string;
  repartidorId: string;
  usuarioId: string | null;
}): Promise<ResultadoDespacho> {
  const pedido = await db.delivery_pedidos.get(params.ordenId);
  if (!pedido) throw new Error("No se encontró el pedido.");
  if (pedido.estado_delivery !== "en_cocina" && pedido.estado_delivery !== "listo") {
    throw new Error("Solo se puede despachar un pedido que ya está en cocina.");
  }
  const repartidor = await db.repartidores.get(params.repartidorId);
  if (!repartidor || !repartidor.activo) throw new Error("Elige un repartidor activo.");

  const factura = await facturarPedidoDelivery({ ordenId: params.ordenId, usuarioId: params.usuarioId });

  const cambios: Record<string, unknown> = { repartidor_id: params.repartidorId };
  if (pedido.estado_delivery === "en_cocina") cambios.estado_delivery = "listo";
  await actualizarPedido(params.ordenId, cambios);
  await db.ordenes.update(params.ordenId, { lista_cocina: true });

  const resFactura = factura ? await imprimirDocumentoFiscal(factura.id) : null;
  const comprobante = await imprimirComprobanteEntrega(params.ordenId);
  return { documentoId: factura?.id ?? null, impresion: { factura: resFactura, comprobante } };
}

/**
 * Cancelar. Si el pedido ya tiene factura NUNCA se borra ni se anula en
 * silencio: se emite la nota de crédito (flujo existente del módulo CAI) y
 * recién entonces se cancela. Si la factura salió de otra caja, hay que
 * cancelar desde esa caja.
 */
export async function cancelarPedido(params: { ordenId: string; motivo: string; usuarioId: string | null }) {
  const motivo = params.motivo.trim();
  if (!motivo) throw new Error("Escribe el motivo de la cancelación.");

  const local = await facturaVigenteLocal(params.ordenId);
  if (local) {
    const nota = await emitirNotaCredito({ facturaId: local.id, usuarioId: params.usuarioId, motivo });
    await actualizarPedido(params.ordenId, { estado_delivery: "cancelado", motivo_cancelacion: motivo });
    return { notaCreditoId: nota.id };
  }

  const supabase = createClient();
  const { data: remotas } = await supabase
    .from("documentos_fiscales")
    .select("id")
    .eq("orden_id", params.ordenId)
    .eq("clase", "factura")
    .eq("estado", "emitida");
  if (remotas?.length) {
    throw new Error("Este pedido ya tiene factura emitida desde otra caja. Cancélalo desde esa caja para generar la nota de crédito.");
  }
  await actualizarPedido(params.ordenId, { estado_delivery: "cancelado", motivo_cancelacion: motivo });
  return { notaCreditoId: null };
}

/** Pausar / reanudar los pedidos web de la sucursal. */
export async function pausarDelivery(sucursalId: string, pausado: boolean) {
  const supabase = createClient();
  const { error } = await supabase.rpc("delivery_pausar", { p_sucursal: sucursalId, p_pausado: pausado });
  if (error) throw new Error(mensajeServidor(error.message));
  const cfg = await db.config.get(CLAVE_DELIVERY_CONFIG);
  if (cfg) await db.config.put({ clave: CLAVE_DELIVERY_CONFIG, valor: { ...(cfg.valor as object), pausado } });
}

export interface DatosPedidoTelefono {
  nombre: string;
  telefono: string;
  zonaId: string;
  direccionReferencia: string;
  metodoPago: MetodoPago;
  pagaCon: number | null;
  conRtn: boolean;
  facturaNombre: string;
  facturaRtn: string;
  items: { productoId: string; cantidad: number; nota?: string }[];
}

/** Registra un pedido por teléfono/WhatsApp: mismas reglas y recálculo que el menú público. */
export async function crearPedidoTelefono(sucursalId: string, d: DatosPedidoTelefono) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("crear_pedido_delivery", {
    p_sucursal: sucursalId,
    p_canal: "delivery_telefono",
    p_pedido: {
      nombre: d.nombre,
      telefono: d.telefono,
      zona_id: d.zonaId,
      direccion_referencia: d.direccionReferencia,
      metodo_pago: d.metodoPago,
      paga_con: d.metodoPago === "efectivo" ? d.pagaCon : null,
      tipo_factura: d.conRtn ? "con_rtn" : "consumidor_final",
      factura_nombre: d.conRtn ? d.facturaNombre : null,
      factura_rtn: d.conRtn ? d.facturaRtn.replace(/\D/g, "") : null,
      items: d.items.map((i) => ({ producto_id: i.productoId, cantidad: i.cantidad, nota: i.nota ?? null })),
    } as never,
  });
  if (error) throw new Error(mensajeServidor(error.message));
  return data as unknown as { orden_id: string; numero: number; total: number };
}
