import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";
import { resumirLiquidaciones, type ResumenDeliveryCierre } from "@/lib/delivery/reportes";
import { separarCierre, type CierreSeparado } from "./separarCierre";
import { fechaLocalHN } from "@/lib/fiscal/formato";
import { rangoDiaHN } from "@/lib/ventas/ventasDelDia";

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
  /** Lo facturado (con CAI) por un lado y lo no facturado (tickets sin factura) por otro, cada uno por método de pago. */
  separado: CierreSeparado;
  productosMasVendidos: { nombre: string; cantidad: number; subtotal: number }[];
  /** Delivery del día: entregas y liquidaciones de repartidores (el efectivo que entregaron en caja). */
  delivery: ResumenDeliveryCierre;
}

export async function obtenerCierreDiario(
  supabase: SupabaseClient<Database>,
  params: { sucursalId: string; desde: string; hasta: string }
): Promise<CierreDiario> {
  const { data: pagos } = await supabase
    .from("pagos")
    .select("orden_id, monto, forma_pago")
    .eq("sucursal_id", params.sucursalId)
    .gte("created_at", params.desde)
    .lte("created_at", params.hasta);

  const porFormaPago: Record<string, number> = {};
  let totalCobrado = 0;
  for (const p of pagos ?? []) {
    porFormaPago[p.forma_pago] = (porFormaPago[p.forma_pago] ?? 0) + Number(p.monto);
    totalCobrado += Number(p.monto);
  }

  // Separación facturado / no facturado: una orden está facturada si tiene factura con CAI
  const idsPagos = [...new Set((pagos ?? []).map((p) => p.orden_id))];
  const facturaPorOrden = new Map<string, "emitida" | "anulada">();
  const anuladasPorSolicitud = new Set<string>();
  if (idsPagos.length > 0) {
    const [{ data: facturas }, { data: aprobadas }] = await Promise.all([
      supabase.from("documentos_fiscales").select("orden_id, estado").eq("clase", "factura").in("orden_id", idsPagos),
      supabase.from("solicitudes_anulacion").select("orden_id").eq("estado", "aprobada").in("orden_id", idsPagos),
    ]);
    for (const f of facturas ?? []) facturaPorOrden.set(f.orden_id, f.estado === "anulada" ? "anulada" : "emitida");
    for (const a of aprobadas ?? []) anuladasPorSolicitud.add(a.orden_id);
  }
  const separado = separarCierre(
    (pagos ?? []).map((p) => ({ orden_id: p.orden_id, forma_pago: p.forma_pago, monto: Number(p.monto) })),
    facturaPorOrden,
    anuladasPorSolicitud
  );

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

  // Delivery: lo cobrado por los repartidores ya está en `pagos` (se registra al entregar);
  // aquí se suma lo que entregaron en caja al liquidar, y la diferencia.
  const [{ count: entregados }, { data: liquidaciones }] = await Promise.all([
    supabase
      .from("ordenes_delivery")
      .select("*", { count: "exact", head: true })
      .eq("sucursal_id", params.sucursalId)
      .eq("estado_delivery", "entregado")
      .gte("entregado_at", params.desde)
      .lte("entregado_at", params.hasta),
    supabase
      .from("liquidaciones_repartidor")
      .select("total_efectivo_cobrado, total_entregado_en_caja, diferencia, total_pago_envios")
      .eq("sucursal_id", params.sucursalId)
      .gte("cerrada_at", params.desde)
      .lte("cerrada_at", params.hasta),
  ]);

  return {
    sucursalId: params.sucursalId,
    totalCobrado,
    totalOrdenes: totalOrdenes ?? 0,
    porFormaPago,
    separado,
    productosMasVendidos,
    delivery: resumirLiquidaciones(entregados ?? 0, (liquidaciones ?? []).map((l) => ({
      total_efectivo_cobrado: Number(l.total_efectivo_cobrado), total_entregado_en_caja: Number(l.total_entregado_en_caja),
      diferencia: Number(l.diferencia), total_pago_envios: Number(l.total_pago_envios),
    }))),
  };
}

/**
 * Rango [00:00, 23:59:59.999] del día dado (o hoy) en ISO, en HORA DE HONDURAS. Antes usaba la hora del
 * servidor (UTC en Vercel), y lo cobrado de noche caía en el día equivocado. Acepta una fecha "YYYY-MM-DD".
 */
export function rangoDelDia(fecha: Date | string = new Date()) {
  return rangoDiaHN(typeof fecha === "string" ? fecha : fechaLocalHN(fecha));
}
