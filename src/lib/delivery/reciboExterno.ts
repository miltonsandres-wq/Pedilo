"use client";

import { db } from "@/lib/offline/db";
import { leerConfigFiscal } from "@/lib/fiscal/emision";
import { servicioImpresion } from "@/lib/printing/enviarComanda";
import { construirReciboDeliveryExterno, type EmisorImprimible } from "@/lib/printing/documentoTexto";
import { logoImpresionCacheado } from "@/lib/printing/logo";
import type { ResultadoImpresion } from "@/lib/printing/types";

/**
 * Imprime el recibo de un cobro con forma de pago «delivery externo». No es
 * documento fiscal: no toca los rangos CAI ni consume correlativo, así que se
 * puede reimprimir las veces que haga falta.
 */
export async function imprimirReciboDeliveryExterno(ordenId: string, referencia?: string | null): Promise<ResultadoImpresion> {
  const sucursal = (await db.config.get("sucursal"))?.valor as { nombre?: string; agenteImpresionUrl?: string | null } | undefined;
  if (!sucursal?.agenteImpresionUrl) {
    return { ok: false, error: "Esta sucursal no tiene configurada la URL del agente de impresión (Admin > Sucursales)." };
  }
  const orden = await db.ordenes.get(ordenId);
  if (!orden) return { ok: false, error: "No se encontró la orden." };
  const items = await db.orden_items.where("orden_id").equals(ordenId).sortBy("created_at");
  if (items.length === 0) return { ok: false, error: "La orden no tiene productos." };

  const emisor = ((await leerConfigFiscal())?.emisor ?? null) as EmisorImprimible | null;
  const instrucciones = construirReciboDeliveryExterno({
    restaurante: emisor?.nombre_comercial || emisor?.razon_social || sucursal.nombre || "Restaurante",
    telefono: emisor?.telefono ?? null,
    numeroDia: orden.numero_dia,
    fecha: new Date(),
    referencia,
    lineas: items.map((i) => ({
      nombre: i.nombre_producto,
      cantidad: i.cantidad,
      precio_unitario: i.precio_unitario,
      total: Math.round(i.cantidad * i.precio_unitario * 100) / 100,
    })),
    subtotal: Number(orden.total),
  });
  return servicioImpresion.enviarImpresion({ instrucciones, logoPngBase64: await logoImpresionCacheado() }, sucursal.agenteImpresionUrl);
}
