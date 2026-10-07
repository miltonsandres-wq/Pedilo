"use client";

import { db } from "@/lib/offline/db";
import { leerConfigFiscal } from "@/lib/fiscal/emision";
import type { ResultadoArmado } from "@/lib/fiscal/impresion";
import { servicioImpresion } from "@/lib/printing/enviarComanda";
import { conAnchoTicket, construirReciboDeliveryExterno, type EmisorImprimible } from "@/lib/printing/documentoTexto";
import { logoImpresionCacheado } from "@/lib/printing/logo";
import type { ResultadoImpresion } from "@/lib/printing/types";

/**
 * Recibo de un cobro «delivery externo». No es documento fiscal: no toca los
 * rangos CAI ni consume correlativo, así que se puede reimprimir las veces que
 * haga falta. `armar…` lo deja listo para la vista previa y para imprimir por
 * cualquier vía (agente, navegador, Bluetooth, USB); `imprimir…` lo manda al
 * agente de la sucursal.
 */
export async function armarReciboDeliveryExterno(
  ordenId: string,
  referencia?: string | null,
  subtitulo?: string
): Promise<ResultadoArmado> {
  const orden = await db.ordenes.get(ordenId);
  if (!orden) return { ok: false, error: "No se encontró la orden." };
  const items = await db.orden_items.where("orden_id").equals(ordenId).sortBy("created_at");
  if (items.length === 0) return { ok: false, error: "La orden no tiene productos." };

  const sucursal = (await db.config.get("sucursal"))?.valor as { nombre?: string } | undefined;
  const emisor = ((await leerConfigFiscal())?.emisor ?? null) as EmisorImprimible | null;
  const datos = {
    restaurante: emisor?.nombre_comercial || emisor?.razon_social || sucursal?.nombre || "Restaurante",
    telefono: emisor?.telefono ?? null,
    numeroDia: orden.numero_dia,
    fecha: new Date(),
    referencia,
    subtitulo,
    lineas: items.map((i) => ({
      nombre: i.nombre_producto,
      cantidad: i.cantidad,
      precio_unitario: i.precio_unitario,
      total: Math.round(i.cantidad * i.precio_unitario * 100) / 100,
    })),
    subtotal: Number(orden.total),
  };
  return {
    ok: true,
    ticket: {
      titulo: "Recibo",
      construir: (columnas) => conAnchoTicket(columnas, () => construirReciboDeliveryExterno(datos)),
      logoPngBase64: await logoImpresionCacheado(),
    },
  };
}

/** Manda el recibo al agente de impresión de la sucursal (si no hay agente, usa la vista previa con las otras vías). */
export async function imprimirReciboDeliveryExterno(ordenId: string, referencia?: string | null): Promise<ResultadoImpresion> {
  const sucursal = (await db.config.get("sucursal"))?.valor as { agenteImpresionUrl?: string | null } | undefined;
  if (!sucursal?.agenteImpresionUrl) {
    return { ok: false, error: "Esta sucursal no tiene configurada la URL del agente de impresión (Admin > Sucursales)." };
  }
  const armado = await armarReciboDeliveryExterno(ordenId, referencia);
  if (!armado.ok) return { ok: false, error: armado.error };
  return servicioImpresion.enviarImpresion(
    { instrucciones: armado.ticket.construir(48), logoPngBase64: armado.ticket.logoPngBase64 },
    sucursal.agenteImpresionUrl
  );
}

/** Recibo de un cobro normal en un negocio SIN facturación CAI (no fiscal), listo para imprimir. */
export const armarReciboSinCai = (ordenId: string) => armarReciboDeliveryExterno(ordenId, null, "Cobro sin factura CAI");
