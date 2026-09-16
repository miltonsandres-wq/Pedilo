"use client";

import { db } from "@/lib/offline/db";
import { encolar, encolarComanda } from "@/lib/offline/outbox";
import type { Comanda } from "@/lib/printing/types";
import type { FormaPago } from "@/lib/types/helpers";

/**
 * Todas las acciones del flujo de orden viven acá y escriben PRIMERO en
 * Dexie (así la UI responde al instante, con o sin internet) y LUEGO
 * encolan la misma escritura en el outbox para que llegue a Supabase en
 * cuanto haya conexión. Nunca esperan una respuesta de red para actualizar
 * la pantalla.
 */

/**
 * 1. El cajero "abre" la mesa: recibe al cliente, anota su nombre (y
 * cuántas personas son) y crea la orden -> estado 'abierta', sin ítems
 * todavía. El mesero la ve aparecer y va a tomar el pedido.
 */
export async function abrirOrden(params: {
  mesaId: string;
  sucursalId: string;
  tenantId: string;
  usuarioId: string;
  clienteNombre?: string;
  personas?: number;
}) {
  const id = crypto.randomUUID();
  const ahora = new Date().toISOString();
  const clienteNombre = params.clienteNombre?.trim() || null;
  const personas = params.personas ?? null;

  await db.ordenes.add({
    id,
    sucursal_id: params.sucursalId,
    mesa_id: params.mesaId,
    usuario_id: params.usuarioId,
    estado: "abierta",
    total: 0,
    cliente_nombre: clienteNombre,
    personas,
    created_at: ahora,
    enviada_at: null,
    pagada_at: null,
    cancelada_at: null,
    motivo_cancelacion: null,
  });
  await db.mesas.update(params.mesaId, { estado: "ocupada" });

  await encolar("ordenes", "insert", id, {
    id,
    tenant_id: params.tenantId,
    sucursal_id: params.sucursalId,
    mesa_id: params.mesaId,
    usuario_id: params.usuarioId,
    estado: "abierta",
    cliente_nombre: clienteNombre,
    personas,
  });
  await encolar("mesas", "update", params.mesaId, { estado: "ocupada" });

  return id;
}

/** 2. Agrega un ítem: el precio se captura AHORA, no queda como referencia viva. */
export async function agregarItem(params: {
  ordenId: string;
  productoId: string;
  nombreProducto: string;
  precioUnitario: number;
  cantidad: number;
  nota?: string;
}) {
  const id = crypto.randomUUID();
  const ahora = new Date().toISOString();

  await db.orden_items.add({
    id,
    orden_id: params.ordenId,
    producto_id: params.productoId,
    nombre_producto: params.nombreProducto,
    cantidad: params.cantidad,
    precio_unitario: params.precioUnitario,
    nota: params.nota ?? null,
    impreso: false,
    origen_cliente: false,
    created_at: ahora,
  });
  await recalcularTotalLocal(params.ordenId);

  await encolar("orden_items", "insert", id, {
    id,
    orden_id: params.ordenId,
    producto_id: params.productoId,
    nombre_producto: params.nombreProducto,
    cantidad: params.cantidad,
    precio_unitario: params.precioUnitario,
    nota: params.nota ?? null,
  });

  return id;
}

/**
 * 3. Confirma la orden: pasa a 'enviada' y SOLO los ítems que aún no se
 * habían mandado a cocina (`impreso = false`) se imprimen ahora. Si luego se
 * agregan más ítems y se vuelve a enviar, de nuevo solo se imprime lo nuevo.
 */
export async function enviarACocina(ordenId: string, mesaNombre: string) {
  const orden = await db.ordenes.get(ordenId);
  const pendientes = await db.orden_items
    .where("orden_id")
    .equals(ordenId)
    .filter((i) => !i.impreso)
    .toArray();

  if (!orden || pendientes.length === 0) return;

  const sucursalCfg = await db.config.get("sucursal");
  const agenteUrl = (sucursalCfg?.valor as { agenteImpresionUrl?: string } | undefined)
    ?.agenteImpresionUrl;

  if (orden.estado === "abierta") {
    await db.ordenes.update(ordenId, { estado: "enviada", enviada_at: new Date().toISOString() });
    await encolar("ordenes", "update", ordenId, {
      estado: "enviada",
      enviada_at: new Date().toISOString(),
    });
  }

  if (agenteUrl) {
    const comanda: Comanda = {
      ordenId,
      mesa: mesaNombre,
      sucursalId: orden.sucursal_id,
      creadaEn: new Date().toISOString(),
      items: pendientes.map((i) => ({
        ordenItemId: i.id,
        nombre: i.nombre_producto,
        cantidad: i.cantidad,
        nota: i.nota,
      })),
    };
    // Encola primero el trabajo de impresión y DESPUÉS el flag impreso=true de
    // cada ítem: si imprimir falla (sin red/agente apagado), estos updates
    // quedan detrás en la cola y el ítem sigue figurando como no impreso.
    await encolarComanda(comanda, agenteUrl);
  }

  for (const item of pendientes) {
    await db.orden_items.update(item.id, { impreso: true });
    await encolar("orden_items", "update", item.id, { impreso: true });
  }
}

/** 4. Registra el pago; el trigger en BD marca la orden 'pagada' y libera la mesa. */
export async function cobrar(params: {
  ordenId: string;
  mesaId: string;
  usuarioId: string;
  monto: number;
  formaPago: FormaPago;
  referencia?: string;
}) {
  const id = crypto.randomUUID();
  const ahora = new Date().toISOString();

  await db.pagos.add({
    id,
    orden_id: params.ordenId,
    usuario_id: params.usuarioId,
    monto: params.monto,
    forma_pago: params.formaPago,
    referencia: params.referencia ?? null,
    created_at: ahora,
  });

  const orden = await db.ordenes.get(params.ordenId);
  const pagos = await db.pagos.where("orden_id").equals(params.ordenId).toArray();
  const totalPagado = pagos.reduce((acc, p) => acc + p.monto, 0);

  if (orden && totalPagado >= orden.total) {
    await db.ordenes.update(params.ordenId, { estado: "pagada", pagada_at: ahora });
    await db.mesas.update(params.mesaId, { estado: "libre" });
  }

  await encolar("pagos", "insert", id, {
    id,
    orden_id: params.ordenId,
    usuario_id: params.usuarioId,
    monto: params.monto,
    forma_pago: params.formaPago,
    referencia: params.referencia ?? null,
  });
  // El trigger fn_pagos_after_insert en Supabase hace el mismo cierre
  // (orden -> pagada, mesa -> libre) del lado del servidor cuando este pago
  // llegue, así que no hace falta encolar esos updates aparte.
}

/**
 * 5. El cajero ajusta el precio unitario de un ítem ya en la comanda (ej.
 * una cortesía o un descuento puntual). Si hay varias unidades del mismo
 * platillo, el total de esa línea (y el total de la orden) recalcula
 * automáticamente cantidad × nuevo precio — nunca hay que tocarlo a mano.
 */
export async function actualizarPrecioItem(params: {
  itemId: string;
  ordenId: string;
  nuevoPrecio: number;
}) {
  await db.orden_items.update(params.itemId, { precio_unitario: params.nuevoPrecio });
  await recalcularTotalLocal(params.ordenId);
  await encolar("orden_items", "update", params.itemId, { precio_unitario: params.nuevoPrecio });
}

/**
 * 6. El mesero agrega o cambia la nota de un ítem que ya está en la comanda
 * (ej. "sin pepinillos", "extra salsa") — sin tener que borrarlo y volver a
 * agregarlo. Si el ítem ya se había enviado a cocina, se vuelve a marcar
 * como no impreso para que la nota nueva también llegue impresa.
 */
export async function actualizarNotaItem(params: {
  itemId: string;
  nuevaNota: string | null;
}) {
  await db.orden_items.update(params.itemId, { nota: params.nuevaNota, impreso: false });
  await encolar("orden_items", "update", params.itemId, { nota: params.nuevaNota, impreso: false });
}

/**
 * 7. Cambia la cantidad de un ítem ya en la comanda (ej. "en realidad son 3
 * hamburguesas, no 2"). Si el ítem ya se había enviado a cocina, se vuelve a
 * marcar como no impreso para que la cantidad corregida salga en el próximo
 * "Enviar a cocina" — igual que con la nota.
 */
export async function actualizarCantidadItem(params: {
  itemId: string;
  ordenId: string;
  nuevaCantidad: number;
}) {
  if (!Number.isFinite(params.nuevaCantidad) || params.nuevaCantidad < 1) return;
  await db.orden_items.update(params.itemId, { cantidad: params.nuevaCantidad, impreso: false });
  await recalcularTotalLocal(params.ordenId);
  await encolar("orden_items", "update", params.itemId, {
    cantidad: params.nuevaCantidad,
    impreso: false,
  });
}

/**
 * 8. Quita un ítem por completo de la comanda (ej. el cliente ya no lo
 * quiere). Si ya se había impreso, esto NO retira el papel que ya salió en
 * cocina — hay que avisarles en persona — pero sí corrige la comanda y el
 * total de una vez.
 */
export async function eliminarItem(params: { itemId: string; ordenId: string }) {
  await db.orden_items.delete(params.itemId);
  await recalcularTotalLocal(params.ordenId);
  await encolar("orden_items", "delete", params.itemId, {});
}

/**
 * 9. Anula la orden completa de una mesa (ej. el cliente se fue sin pedir
 * nada, o se equivocaron de mesa). Libera la mesa de inmediato. Se puede
 * anular una orden 'abierta' o 'enviada', nunca una ya pagada (esa pantalla
 * ni siquiera la muestra).
 */
export async function anularOrden(params: { ordenId: string; mesaId: string; motivo?: string }) {
  const ahora = new Date().toISOString();
  const motivo = params.motivo?.trim() || null;

  await db.ordenes.update(params.ordenId, {
    estado: "cancelada",
    cancelada_at: ahora,
    motivo_cancelacion: motivo,
  });
  await db.mesas.update(params.mesaId, { estado: "libre" });

  await encolar("ordenes", "update", params.ordenId, {
    estado: "cancelada",
    cancelada_at: ahora,
    motivo_cancelacion: motivo,
  });
  await encolar("mesas", "update", params.mesaId, { estado: "libre" });
}

async function recalcularTotalLocal(ordenId: string) {
  const items = await db.orden_items.where("orden_id").equals(ordenId).toArray();
  const total = items.reduce((acc, i) => acc + i.cantidad * i.precio_unitario, 0);
  await db.ordenes.update(ordenId, { total });
}
