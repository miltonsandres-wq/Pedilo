import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";
import { clasificarVentas, rangoDiaHN, type VentaDia } from "./ventasDelDia";

/**
 * Trae las ventas cobradas ese día (hora de Honduras) y las clasifica. Usa el cliente con la sesión
 * del usuario: la RLS decide qué sucursales ve (el admin todas, el cajero la suya).
 */
export async function cargarVentasDelDia(
  supabase: SupabaseClient<Database>,
  params: { fecha: string; sucursalId?: string }
): Promise<VentaDia[]> {
  const { desde, hasta } = rangoDiaHN(params.fecha);

  let q = supabase
    .from("ordenes")
    .select("id, sucursal_id, mesa_id, numero_dia, cliente_nombre, total, pagada_at, canal")
    .eq("estado", "pagada")
    .gte("pagada_at", desde)
    .lte("pagada_at", hasta);
  if (params.sucursalId) q = q.eq("sucursal_id", params.sucursalId);
  const { data: ordenes } = await q;
  const pagadas = (ordenes ?? []).filter((o): o is typeof o & { pagada_at: string } => !!o.pagada_at);
  if (pagadas.length === 0) return [];

  const ids = pagadas.map((o) => o.id);
  const mesaIds = [...new Set(pagadas.map((o) => o.mesa_id).filter((m): m is string => !!m))];
  const [{ data: pagos }, { data: facturas }, { data: solicitudes }, { data: mesas }] = await Promise.all([
    supabase.from("pagos").select("orden_id, forma_pago, monto").in("orden_id", ids),
    supabase
      .from("documentos_fiscales")
      .select("id, orden_id, numero_completo, cliente_nombre, cliente_rtn, total, estado, anulada_motivo")
      .eq("clase", "factura")
      .in("orden_id", ids),
    supabase.from("solicitudes_anulacion").select("id, orden_id, estado, motivo, respuesta, created_at").in("orden_id", ids),
    mesaIds.length ? supabase.from("mesas").select("id, nombre").in("id", mesaIds) : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
  ]);

  return clasificarVentas({
    ordenes: pagadas.map((o) => ({ ...o, total: Number(o.total), pagada_at: o.pagada_at })),
    pagos: (pagos ?? []).map((p) => ({ ...p, monto: Number(p.monto) })),
    facturas: (facturas ?? []).map((f) => ({ ...f, total: Number(f.total), estado: f.estado === "anulada" ? "anulada" : "emitida" })),
    solicitudes: (solicitudes ?? []).map((s) => ({ ...s, estado: s.estado as "pendiente" | "aprobada" | "rechazada" })),
    mesas: new Map((mesas ?? []).map((m) => [m.id, m.nombre])),
  });
}
