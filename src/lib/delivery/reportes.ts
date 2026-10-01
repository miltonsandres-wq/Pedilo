import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";

/**
 * Reporte de delivery por rango de fechas: pedidos por repartidor, tiempos
 * promedio y cancelaciones. `construirReporteDelivery` es pura (recibe filas);
 * `obtenerReporteDelivery` las lee con la sesión del admin (RLS por negocio).
 */

export interface FilaReporte {
  repartidor_id: string | null;
  estado_delivery: string;
  metodo_pago: string;
  tarifa_envio: number;
  monto_cobrado: number | null;
  recibido_at: string;
  aceptado_at: string | null;
  listo_at: string | null;
  en_camino_at: string | null;
  entregado_at: string | null;
  motivo_cancelacion: string | null;
}

export interface FilaRepartidorReporte {
  repartidorId: string;
  nombre: string;
  entregados: number;
  /** Promedio de en_camino → entregado, en minutos. */
  minutosEntregaPromedio: number | null;
  efectivoCobrado: number;
  totalCobrado: number;
}

export interface ReporteDelivery {
  totalPedidos: number;
  entregados: number;
  cancelados: number;
  rechazados: number;
  enCurso: number;
  /** % de pedidos del rango que terminaron cancelados o rechazados. */
  tasaCancelacion: number;
  ventasEnvio: number;
  tiempos: {
    recibidoAAceptadoMin: number | null;
    aceptadoAListoMin: number | null;
    enCaminoAEntregadoMin: number | null;
  };
  porRepartidor: FilaRepartidorReporte[];
  motivosCancelacion: { motivo: string; cantidad: number }[];
}

const minutosEntre = (desde: string | null, hasta: string | null): number | null => {
  if (!desde || !hasta) return null;
  const m = (new Date(hasta).getTime() - new Date(desde).getTime()) / 60_000;
  return m >= 0 ? m : null;
};

function promedio(valores: (number | null)[]): number | null {
  const v = valores.filter((x): x is number => x != null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
}

export function construirReporteDelivery(filas: FilaReporte[], nombres: Map<string, string>): ReporteDelivery {
  const entregados = filas.filter((f) => f.estado_delivery === "entregado");
  const cancelados = filas.filter((f) => f.estado_delivery === "cancelado");
  const rechazados = filas.filter((f) => f.estado_delivery === "rechazado");

  const porRep = new Map<string, FilaReporte[]>();
  for (const f of entregados) {
    if (!f.repartidor_id) continue;
    porRep.set(f.repartidor_id, [...(porRep.get(f.repartidor_id) ?? []), f]);
  }

  const motivos = new Map<string, number>();
  for (const f of [...cancelados, ...rechazados]) {
    const m = (f.motivo_cancelacion ?? "Sin motivo").trim() || "Sin motivo";
    motivos.set(m, (motivos.get(m) ?? 0) + 1);
  }

  const terminados = entregados.length + cancelados.length + rechazados.length;
  return {
    totalPedidos: filas.length,
    entregados: entregados.length,
    cancelados: cancelados.length,
    rechazados: rechazados.length,
    enCurso: filas.length - terminados,
    tasaCancelacion: terminados ? Math.round(((cancelados.length + rechazados.length) / terminados) * 1000) / 10 : 0,
    ventasEnvio: Math.round(entregados.reduce((a, f) => a + Number(f.tarifa_envio), 0) * 100) / 100,
    tiempos: {
      recibidoAAceptadoMin: promedio(filas.map((f) => minutosEntre(f.recibido_at, f.aceptado_at))),
      aceptadoAListoMin: promedio(filas.map((f) => minutosEntre(f.aceptado_at, f.listo_at))),
      enCaminoAEntregadoMin: promedio(entregados.map((f) => minutosEntre(f.en_camino_at, f.entregado_at))),
    },
    porRepartidor: [...porRep.entries()]
      .map(([id, fs]) => ({
        repartidorId: id,
        nombre: nombres.get(id) ?? "Repartidor",
        entregados: fs.length,
        minutosEntregaPromedio: promedio(fs.map((f) => minutosEntre(f.en_camino_at, f.entregado_at))),
        efectivoCobrado: Math.round(fs.filter((f) => f.metodo_pago === "efectivo").reduce((a, f) => a + Number(f.monto_cobrado ?? 0), 0) * 100) / 100,
        totalCobrado: Math.round(fs.reduce((a, f) => a + Number(f.monto_cobrado ?? 0), 0) * 100) / 100,
      }))
      .sort((a, b) => b.entregados - a.entregados),
    motivosCancelacion: [...motivos.entries()].map(([motivo, cantidad]) => ({ motivo, cantidad })).sort((a, b) => b.cantidad - a.cantidad),
  };
}

export async function obtenerReporteDelivery(
  supabase: SupabaseClient<Database>,
  params: { sucursalId: string | null; desde: string; hasta: string }
): Promise<ReporteDelivery> {
  let consulta = supabase
    .from("ordenes_delivery")
    .select("repartidor_id, estado_delivery, metodo_pago, tarifa_envio, monto_cobrado, recibido_at, aceptado_at, listo_at, en_camino_at, entregado_at, motivo_cancelacion")
    .gte("recibido_at", params.desde)
    .lte("recibido_at", params.hasta);
  if (params.sucursalId) consulta = consulta.eq("sucursal_id", params.sucursalId);
  const [{ data: filas }, { data: reps }] = await Promise.all([
    consulta,
    supabase.from("repartidores").select("id, nombre"),
  ]);
  return construirReporteDelivery(
    (filas ?? []).map((f) => ({ ...f, tarifa_envio: Number(f.tarifa_envio), monto_cobrado: f.monto_cobrado != null ? Number(f.monto_cobrado) : null })),
    new Map((reps ?? []).map((r) => [r.id, r.nombre]))
  );
}

/** Resumen de delivery para el cierre diario de una sucursal. */
export interface ResumenDeliveryCierre {
  pedidosEntregados: number;
  liquidaciones: number;
  efectivoEntregadoEnCaja: number;
  efectivoCobradoSegunSistema: number;
  diferencia: number;
  pagoEnvios: number;
}

export function resumirLiquidaciones(
  pedidosEntregados: number,
  liquidaciones: { total_efectivo_cobrado: number; total_entregado_en_caja: number; diferencia: number; total_pago_envios: number }[]
): ResumenDeliveryCierre {
  const suma = (k: "total_efectivo_cobrado" | "total_entregado_en_caja" | "diferencia" | "total_pago_envios") =>
    Math.round(liquidaciones.reduce((a, l) => a + Number(l[k]), 0) * 100) / 100;
  return {
    pedidosEntregados,
    liquidaciones: liquidaciones.length,
    efectivoEntregadoEnCaja: suma("total_entregado_en_caja"),
    efectivoCobradoSegunSistema: suma("total_efectivo_cobrado"),
    diferencia: suma("diferencia"),
    pagoEnvios: suma("total_pago_envios"),
  };
}

/** "2026-06-01" → inicio y fin de ese rango en hora de Honduras (UTC-6, sin horario de verano), como ISO. */
export function rangoFechasHN(desde: string, hasta: string): { desde: string; hasta: string } {
  return {
    desde: new Date(`${desde}T00:00:00-06:00`).toISOString(),
    hasta: new Date(`${hasta}T23:59:59.999-06:00`).toISOString(),
  };
}
