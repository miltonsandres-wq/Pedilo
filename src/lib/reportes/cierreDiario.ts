import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";

/**
 * El cierre diario NO es una tabla: es una consulta que suma los `pagos`
 * del rango de fechas por sucursal, desglosada por forma de pago, más los
 * productos más vendidos (a partir de `orden_items` de las órdenes pagadas).
 */
export interface CierreDiario {
  sucursalId: string;
  totalCobrado: number;
  totalOrdenes: number;
  porFormaPago: Record<string, number>;
  productosMasVendidos: { nombre: string; cantidad: number; subtotal: number }[];
}

export async function obtenerCierreDiario(
  supabase: SupabaseClient<Database>,
  params: { sucursalId: string; desde: string; hasta: string }
): Promise<CierreDiario> {
  const { data: pagos } = await supabase
    .from("pagos")
    .select("monto, forma_pago")
    .eq("sucursal_id", params.sucursalId)
    .gte("created_at", params.desde)
    .lte("created_at", params.hasta);

  const porFormaPago: Record<string, number> = {};
  let totalCobrado = 0;
  for (const p of pagos ?? []) {
    porFormaPago[p.forma_pago] = (porFormaPago[p.forma_pago] ?? 0) + Number(p.monto);
    totalCobrado += Number(p.monto);
  }

  // Cuenta TODAS las órdenes abiertas ese día (pagadas, canceladas, etc.) —
  // cada una consumió un número de orden al crearse, sin importar en qué
  // haya terminado.
  const { count: totalOrdenes } = await supabase
    .from("ordenes")
    .select("*", { count: "exact", head: true })
    .eq("sucursal_id", params.sucursalId)
    .gte("created_at", params.desde)
    .lte("created_at", params.hasta);

  const { data: ordenesPagadas } = await supabase
    .from("ordenes")
    .select("id")
    .eq("sucursal_id", params.sucursalId)
    .eq("estado", "pagada")
    .gte("pagada_at", params.desde)
    .lte("pagada_at", params.hasta);

  const ordenIds = (ordenesPagadas ?? []).map((o) => o.id);

  let productosMasVendidos: CierreDiario["productosMasVendidos"] = [];
  if (ordenIds.length > 0) {
    const { data: items } = await supabase
      .from("orden_items")
      .select("nombre_producto, cantidad, precio_unitario")
      .in("orden_id", ordenIds);

    const acumulado = new Map<string, { cantidad: number; subtotal: number }>();
    for (const item of items ?? []) {
      const actual = acumulado.get(item.nombre_producto) ?? { cantidad: 0, subtotal: 0 };
      actual.cantidad += item.cantidad;
      actual.subtotal += item.cantidad * Number(item.precio_unitario);
      acumulado.set(item.nombre_producto, actual);
    }
    productosMasVendidos = [...acumulado.entries()]
      .map(([nombre, v]) => ({ nombre, ...v }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 10);
  }

  return {
    sucursalId: params.sucursalId,
    totalCobrado,
    totalOrdenes: totalOrdenes ?? 0,
    porFormaPago,
    productosMasVendidos,
  };
}

/** Rango [00:00, 23:59:59] del día dado (o hoy) en ISO, hora local del servidor. */
export function rangoDelDia(fecha = new Date()) {
  const desde = new Date(fecha);
  desde.setHours(0, 0, 0, 0);
  const hasta = new Date(fecha);
  hasta.setHours(23, 59, 59, 999);
  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
}
