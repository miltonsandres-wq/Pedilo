"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fechaLocalHN } from "@/lib/fiscal/formato";
import { obtenerCierreDiario, rangoDelDia } from "@/lib/reportes/cierreDiario";
import { problemasParaCerrar } from "@/lib/reportes/cerrarDia";
import { fechaValida } from "@/lib/ventas/ventasDelDia";

function volver(tipo: "ok" | "error", mensaje: string, fecha: string): never {
  redirect(`/admin/reportes?fecha=${fecha}&${tipo}=${encodeURIComponent(mensaje)}`);
}

/**
 * Cierra el día de una sucursal: guarda una foto de lo cobrado (facturado, no facturado, anulado y cada
 * método de pago) que ya no cambia. Solo el administrador; un solo cierre por sucursal y día.
 */
export async function cerrarDia(formData: FormData) {
  const sesion = await requireAdmin();
  const supabase = await createClient();

  const hoy = fechaLocalHN(new Date());
  const fecha = fechaValida(String(formData.get("fecha") ?? ""), hoy);
  const sucursalId = String(formData.get("sucursal_id") ?? "");
  const { desde, hasta } = rangoDelDia(fecha);

  const { data: sucursal } = await supabase
    .from("sucursales")
    .select("id, nombre")
    .eq("id", sucursalId)
    .eq("tenant_id", sesion.tenant_id)
    .maybeSingle();
  if (!sucursal) volver("error", "No se encontró la sucursal.", fecha);

  const [{ data: previo }, { count: abiertos }, { count: pendientes }] = await Promise.all([
    supabase.from("cierres_diarios").select("id").eq("sucursal_id", sucursalId).eq("fecha", fecha).maybeSingle(),
    supabase
      .from("ordenes")
      .select("id", { count: "exact", head: true })
      .eq("sucursal_id", sucursalId)
      .in("estado", ["abierta", "enviada"])
      .gte("created_at", desde)
      .lte("created_at", hasta),
    supabase
      .from("solicitudes_anulacion")
      .select("id", { count: "exact", head: true })
      .eq("sucursal_id", sucursalId)
      .eq("estado", "pendiente"),
  ]);

  const problema = problemasParaCerrar({
    fecha,
    hoy,
    yaCerrado: !!previo,
    pedidosAbiertos: abiertos ?? 0,
    anulacionesPendientes: pendientes ?? 0,
  });
  if (problema) volver("error", problema, fecha);

  const cierre = await obtenerCierreDiario(supabase, { sucursalId, desde, hasta });
  const notas = String(formData.get("notas") ?? "").trim().slice(0, 500) || null;

  const { error } = await supabase.from("cierres_diarios").insert({
    tenant_id: sesion.tenant_id,
    sucursal_id: sucursalId,
    fecha,
    total_cobrado: cierre.totalCobrado,
    total_ordenes: cierre.totalOrdenes,
    datos: JSON.parse(JSON.stringify(cierre)),
    notas,
    cerrado_por: sesion.id,
  });
  if (error) {
    if (error.code === "23505") volver("error", "Ese día ya está cerrado.", fecha);
    const falta = /cierres_diarios|schema cache|relation/i.test(error.message);
    volver("error", falta ? "Falta aplicar la migración 0037_cierres_diarios.sql en Supabase." : "No se pudo cerrar el día. Inténtalo de nuevo.", fecha);
  }

  revalidatePath("/admin/reportes");
  volver("ok", `Día ${fecha} cerrado en ${sucursal.nombre}. Ya puedes descargar el Excel.`, fecha);
}
