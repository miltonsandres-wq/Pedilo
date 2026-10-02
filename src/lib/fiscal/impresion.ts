import { db, type DocumentoFiscalLocal } from "@/lib/offline/db";
import { servicioImpresion } from "@/lib/printing/enviarComanda";
import {
  construirFactura,
  construirPrecuenta,
  conAnchoTicket,
  type DocumentoImprimible,
  type EmisorImprimible,
} from "@/lib/printing/documentoTexto";
import { logoImpresionCacheado } from "@/lib/printing/logo";
import type { Instruccion, ResultadoImpresion } from "@/lib/printing/types";
import { leerConfigFiscal } from "./emision";

/**
 * Orquestación de impresión de documentos: arma el ticket (documentoTexto.ts),
 * le pega el logo cacheado y lo manda al agente de la sucursal. Imprimir NUNCA
 * consume correlativo: el número se asignó al emitir, aquí solo se dibuja.
 */

async function urlAgente(): Promise<string | null> {
  const cfg = await db.config.get("sucursal");
  return (cfg?.valor as { agenteImpresionUrl?: string | null } | undefined)?.agenteImpresionUrl ?? null;
}

const SIN_AGENTE: ResultadoImpresion = {
  ok: false,
  error: "Esta sucursal no tiene configurada la URL del agente de impresión (Admin > Sucursales).",
};

function comoImprimible(doc: DocumentoFiscalLocal): DocumentoImprimible {
  return doc as unknown as DocumentoImprimible;
}

/**
 * Imprime una factura / nota.
 *  - Original (copia "cliente"): la primera vez sale limpia; si ya se había
 *    impreso bien antes, sale marcada "REIMPRESIÓN". Si la primera impresión
 *    falló (agente apagado), reintentar sigue siendo el original.
 *  - Copia "emisor": lleva "Copia: Emisor" y no cuenta como original ni como reimpresión.
 */
export async function imprimirDocumentoFiscal(
  documentoId: string,
  opciones: { copia?: "cliente" | "emisor" } = {}
): Promise<ResultadoImpresion> {
  const doc = await db.documentos_fiscales.get(documentoId);
  if (!doc) return { ok: false, error: "No se encontró el documento en este dispositivo." };

  const agenteUrl = await urlAgente();
  if (!agenteUrl) return SIN_AGENTE;

  const copia = opciones.copia ?? "cliente";
  const referencia = doc.documento_referencia_id
    ? await db.documentos_fiscales.get(doc.documento_referencia_id)
    : undefined;

  const instrucciones = construirFactura(comoImprimible(doc), {
    copia,
    reimpresion: copia === "cliente" && !!doc.impreso_at,
    referencia: referencia
      ? { numero_completo: referencia.numero_completo, cai: referencia.cai, fecha_emision: referencia.fecha_emision }
      : null,
  });

  const resultado = await servicioImpresion.enviarImpresion(
    { instrucciones, logoPngBase64: await logoImpresionCacheado() },
    agenteUrl
  );

  if (resultado.ok && copia === "cliente" && !doc.impreso_at) {
    await db.documentos_fiscales.update(documentoId, { impreso_at: new Date().toISOString() });
  }
  return resultado;
}

/** Pre-cuenta de una orden abierta: NO es documento fiscal y NO consume correlativo. */
export async function imprimirPrecuenta(ordenId: string, mesaNombre: string): Promise<ResultadoImpresion> {
  const agenteUrl = await urlAgente();
  if (!agenteUrl) return SIN_AGENTE;

  const orden = await db.ordenes.get(ordenId);
  if (!orden) return { ok: false, error: "No se encontró la orden." };
  const items = await db.orden_items.where("orden_id").equals(ordenId).sortBy("created_at");
  if (items.length === 0) return { ok: false, error: "La orden todavía no tiene productos." };

  const cfg = await leerConfigFiscal();
  const sucursal = (await db.config.get("sucursal"))?.valor as { nombre?: string } | undefined;

  const instrucciones = construirPrecuenta({
    emisor: (cfg?.emisor as EmisorImprimible | null | undefined) ?? null,
    nombreNegocio: sucursal?.nombre ?? "",
    mesa: mesaNombre,
    numeroDia: orden.numero_dia,
    clienteNombre: orden.cliente_nombre,
    fecha: new Date(),
    lineas: items.map((i) => ({
      nombre: i.nombre_producto,
      cantidad: i.cantidad,
      precio_unitario: i.precio_unitario,
      total: Math.round(i.cantidad * i.precio_unitario * 100) / 100,
    })),
    total: orden.total,
  });

  return servicioImpresion.enviarImpresion({ instrucciones, logoPngBase64: await logoImpresionCacheado() }, agenteUrl);
}

// --- armar el ticket SIN imprimirlo (vista previa + impresión directa del navegador) ----

/**
 * Un ticket listo para mostrar o imprimir en cualquier ancho de papel. Quien lo
 * recibe elige el ancho (80 mm = 48 columnas, 58 mm = 32) al llamar a `construir`.
 */
export interface TicketArmado {
  titulo: string;
  construir(columnas: number): Instruccion[];
  logoPngBase64: string | null;
}

export type ResultadoArmado<T = object> = ({ ok: true; ticket: TicketArmado } & T) | { ok: false; error: string };

/** La factura/nota tal como saldría impresa (original, copia del emisor o reimpresión). */
export async function armarFactura(
  documentoId: string,
  opciones: { copia?: "cliente" | "emisor" } = {}
): Promise<ResultadoArmado<{ doc: DocumentoFiscalLocal }>> {
  const doc = await db.documentos_fiscales.get(documentoId);
  if (!doc) return { ok: false, error: "No se encontró el documento en este dispositivo." };
  const copia = opciones.copia ?? "cliente";
  const referencia = doc.documento_referencia_id ? await db.documentos_fiscales.get(doc.documento_referencia_id) : undefined;
  const opcionesFactura = {
    copia,
    reimpresion: copia === "cliente" && !!doc.impreso_at,
    referencia: referencia
      ? { numero_completo: referencia.numero_completo, cai: referencia.cai, fecha_emision: referencia.fecha_emision }
      : null,
  };
  return {
    ok: true,
    doc,
    ticket: {
      titulo: doc.clase === "factura" ? "Factura" : "Nota",
      construir: (columnas) => conAnchoTicket(columnas, () => construirFactura(comoImprimible(doc), opcionesFactura)),
      logoPngBase64: await logoImpresionCacheado(),
    },
  };
}

/** Deja registrado que el ORIGINAL ya salió impreso (por la vía que sea). */
export async function marcarFacturaImpresa(documentoId: string) {
  const doc = await db.documentos_fiscales.get(documentoId);
  if (doc && !doc.impreso_at) await db.documentos_fiscales.update(documentoId, { impreso_at: new Date().toISOString() });
}

/** La pre-cuenta de una orden abierta, sin imprimirla. */
export async function armarPrecuenta(ordenId: string, mesaNombre: string): Promise<ResultadoArmado> {
  const orden = await db.ordenes.get(ordenId);
  if (!orden) return { ok: false, error: "No se encontró la orden." };
  const items = await db.orden_items.where("orden_id").equals(ordenId).sortBy("created_at");
  if (items.length === 0) return { ok: false, error: "La orden todavía no tiene productos." };
  const cfg = await leerConfigFiscal();
  const sucursal = (await db.config.get("sucursal"))?.valor as { nombre?: string } | undefined;
  const datos = {
    emisor: (cfg?.emisor as EmisorImprimible | null | undefined) ?? null,
    nombreNegocio: sucursal?.nombre ?? "",
    mesa: mesaNombre,
    numeroDia: orden.numero_dia,
    clienteNombre: orden.cliente_nombre,
    fecha: new Date(),
    lineas: items.map((i) => ({
      nombre: i.nombre_producto,
      cantidad: i.cantidad,
      precio_unitario: i.precio_unitario,
      total: Math.round(i.cantidad * i.precio_unitario * 100) / 100,
    })),
    total: orden.total,
  };
  return {
    ok: true,
    ticket: {
      titulo: "Pre-cuenta",
      construir: (columnas) => conAnchoTicket(columnas, () => construirPrecuenta(datos)),
      logoPngBase64: await logoImpresionCacheado(),
    },
  };
}

/** URL del agente de impresión de esta sucursal (null si no hay: se imprime con el navegador/Bluetooth/USB). */
export async function agenteImpresionUrl(): Promise<string | null> {
  return urlAgente();
}
