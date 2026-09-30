import { db, type DocumentoFiscalLocal } from "@/lib/offline/db";
import { servicioImpresion } from "@/lib/printing/enviarComanda";
import {
  construirFactura,
  construirPrecuenta,
  type DocumentoImprimible,
  type EmisorImprimible,
} from "@/lib/printing/documentoTexto";
import { logoImpresionCacheado } from "@/lib/printing/logo";
import type { ResultadoImpresion } from "@/lib/printing/types";
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
