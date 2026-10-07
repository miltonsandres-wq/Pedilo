import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fechaLocalHN } from "@/lib/fiscal/formato";
import { cargarVentasEnRango } from "@/lib/ventas/cargar";
import { enLotes } from "@/lib/ventas/lotes";
import { fechaValida, rangoDiaHN } from "@/lib/ventas/ventasDelDia";
import { construirExcelReportes } from "@/lib/reportes/excel";

/** Máximo de días por archivo: un año completo. */
const MAX_DIAS = 366;

/**
 * Reporte del cierre de caja en Excel (.xlsx) para un periodo y, opcionalmente, una sucursal.
 * /admin/reportes/excel?desde=2026-10-01&hasta=2026-10-31&sucursal=<id>
 */
export async function GET(request: Request) {
  const sesion = await requireAdmin();
  const supabase = await createClient();
  const url = new URL(request.url);

  const hoy = fechaLocalHN(new Date());
  const hasta = fechaValida(url.searchParams.get("hasta") ?? undefined, hoy);
  const desde = fechaValida(url.searchParams.get("desde") ?? undefined, hasta);
  if (desde > hasta) return new Response("La fecha inicial no puede ser posterior a la final.", { status: 400 });
  if ((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000 >= MAX_DIAS) {
    return new Response("El periodo es muy largo: máximo un año por archivo.", { status: 400 });
  }
  const sucursalParam = url.searchParams.get("sucursal") || undefined;

  const [{ data: tenant }, { data: sucursalesTodas }] = await Promise.all([
    supabase.from("tenants").select("nombre").eq("id", sesion.tenant_id).single(),
    supabase.from("sucursales").select("id, nombre").eq("tenant_id", sesion.tenant_id).order("nombre"),
  ]);
  const sucursales = (sucursalesTodas ?? []).filter((s) => !sucursalParam || s.id === sucursalParam);
  if (sucursales.length === 0) return new Response("Sucursal no encontrada.", { status: 404 });

  const rango = { desde: rangoDiaHN(desde).desde, hasta: rangoDiaHN(hasta).hasta };
  const ventas = (await Promise.all(sucursales.map((s) => cargarVentasEnRango(supabase, { ...rango, sucursalId: s.id })))).flat();

  // Productos vendidos: solo de lo vigente (lo anulado no cuenta)
  const idsVigentes = ventas.filter((v) => !v.anulada).map((v) => v.ordenId);
  const items = (
    await Promise.all(
      enLotes(idsVigentes).map((l) => supabase.from("orden_items").select("nombre_producto, cantidad, precio_unitario").in("orden_id", l))
    )
  ).flatMap((r) => r.data ?? []);
  const acumulado = new Map<string, { cantidad: number; total: number }>();
  for (const i of items) {
    const a = acumulado.get(i.nombre_producto) ?? { cantidad: 0, total: 0 };
    a.cantidad += i.cantidad;
    a.total += i.cantidad * Number(i.precio_unitario);
    acumulado.set(i.nombre_producto, a);
  }

  // Días ya cerrados en el periodo
  const { data: cierresDb } = await supabase
    .from("cierres_diarios")
    .select("sucursal_id, fecha, cerrado_at, cerrado_por")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .in("sucursal_id", sucursales.map((s) => s.id));
  const idsUsuarios = [...new Set((cierresDb ?? []).map((c) => c.cerrado_por).filter((x): x is string => !!x))];
  const { data: usuarios } = idsUsuarios.length
    ? await supabase.from("usuarios").select("id, nombre").in("id", idsUsuarios)
    : { data: [] as { id: string; nombre: string }[] };
  const nombreUsuario = new Map((usuarios ?? []).map((u) => [u.id, u.nombre]));

  const archivo = await construirExcelReportes({
    negocio: tenant?.nombre ?? "Mi negocio",
    desde,
    hasta,
    sucursales,
    ventas,
    cierres: (cierresDb ?? []).map((c) => ({ ...c, cerrado_por: c.cerrado_por ? (nombreUsuario.get(c.cerrado_por) ?? null) : null })),
    productos: [...acumulado.entries()].map(([nombre, v]) => ({ nombre, ...v })),
    generadoEn: new Date(),
  });

  const nombre = `cierre-${desde}${desde === hasta ? "" : `_${hasta}`}.xlsx`;
  return new Response(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
