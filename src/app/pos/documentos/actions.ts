"use server";

import { revalidatePath } from "next/cache";
import { requireSucursal } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type ResultadoSolicitud = { ok: true; mensaje: string } | { ok: false; error: string };

/**
 * El cajero pide anular una venta (factura con CAI o cobro sin CAI) y explica por qué. NO se anula
 * nada todavía: queda «pendiente» hasta que el administrador la apruebe o la rechace
 * (Admin > Facturas). Los datos de la venta se leen del servidor, no del navegador.
 */
export async function solicitarAnulacion(params: {
  ordenId: string;
  documentoId: string | null;
  motivo: string;
}): Promise<ResultadoSolicitud> {
  const sesion = await requireSucursal();
  if (sesion.rol !== "cajero" && sesion.rol !== "admin") {
    return { ok: false, error: "Solo el cajero o el administrador pueden pedir una anulación." };
  }
  const motivo = params.motivo.trim();
  if (motivo.length < 5) return { ok: false, error: "Explica el motivo (al menos 5 letras)." };
  if (motivo.length > 300) return { ok: false, error: "El motivo es muy largo (máximo 300 caracteres)." };

  const supabase = await createClient();
  const aunNoLlega = "Esta venta todavía no llegó al servidor. Con internet, espera unos segundos e inténtalo de nuevo.";

  const { data: orden } = await supabase
    .from("ordenes")
    .select("id, sucursal_id, estado, numero_dia, total")
    .eq("id", params.ordenId)
    .maybeSingle();
  if (!orden || orden.estado !== "pagada") return { ok: false, error: aunNoLlega };

  let referencia = orden.numero_dia != null ? `Orden #${orden.numero_dia}` : "Cobro sin factura";
  let monto = Number(orden.total);
  if (params.documentoId) {
    const { data: doc } = await supabase
      .from("documentos_fiscales")
      .select("id, orden_id, numero_completo, total, estado, clase")
      .eq("id", params.documentoId)
      .maybeSingle();
    if (!doc || doc.orden_id !== orden.id) return { ok: false, error: aunNoLlega };
    if (doc.clase !== "factura") return { ok: false, error: "Solo se puede pedir la anulación de una factura." };
    if (doc.estado === "anulada") return { ok: false, error: "Esa factura ya está anulada." };
    referencia = doc.numero_completo;
    monto = Number(doc.total);
  }

  const { error } = await supabase.from("solicitudes_anulacion").insert({
    tenant_id: sesion.tenant_id,
    sucursal_id: orden.sucursal_id,
    orden_id: orden.id,
    documento_id: params.documentoId,
    referencia,
    monto,
    motivo,
    solicitada_por: sesion.id,
  });
  if (error) {
    // Índice único: ya hay una pendiente para esta orden
    if (error.code === "23505") return { ok: false, error: "Ya hay una solicitud pendiente para esta venta." };
    return { ok: false, error: "No se pudo enviar la solicitud. Inténtalo de nuevo." };
  }

  revalidatePath("/pos/documentos");
  return { ok: true, mensaje: "Solicitud enviada. El administrador debe aprobarla para que se anule." };
}
