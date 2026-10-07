import { Wallet, Flame, Calendar, Receipt, Bike, CheckCircle2, TriangleAlert, FileSpreadsheet, Lock } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { obtenerCierreDiario, rangoDelDia } from "@/lib/reportes/cierreDiario";
import { Card, CardHeader, PageHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { fechaLocalHN, formatearFechaHora, primerDiaDelMes } from "@/lib/fiscal/formato";
import { fechaValida } from "@/lib/ventas/ventasDelDia";
import { cerrarDia } from "./actions";

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; ok?: string; error?: string }>;
}) {
  const sesion = await requireAdmin();
  const supabase = await createClient();
  const { fecha: fechaParam, ok, error } = await searchParams;

  // Día en hora de Honduras (YYYY-MM-DD)
  const hoy = fechaLocalHN(new Date());
  const fecha = fechaValida(fechaParam, hoy);
  const { desde, hasta } = rangoDelDia(fecha);

  const { data: sucursales } = await supabase
    .from("sucursales")
    .select("id, nombre")
    .eq("tenant_id", sesion.tenant_id)
    .eq("activo", true)
    .order("nombre");

  const cierres = await Promise.all(
    (sucursales ?? []).map((s) => obtenerCierreDiario(supabase, { sucursalId: s.id, desde, hasta }))
  );

  // Cierres ya hechos: los de este día y los últimos registrados
  const [{ data: cierresDelDia }, { data: ultimosCierres }] = await Promise.all([
    supabase.from("cierres_diarios").select("sucursal_id, cerrado_at, cerrado_por").eq("fecha", fecha),
    supabase.from("cierres_diarios").select("sucursal_id, fecha, cerrado_at, total_cobrado").order("fecha", { ascending: false }).limit(10),
  ]);
  const idsQuienCerro = [...new Set((cierresDelDia ?? []).map((c) => c.cerrado_por).filter((x): x is string => !!x))];
  const { data: quienes } = idsQuienCerro.length
    ? await supabase.from("usuarios").select("id, nombre").in("id", idsQuienCerro)
    : { data: [] as { id: string; nombre: string }[] };
  const nombreUsuario = new Map((quienes ?? []).map((u) => [u.id, u.nombre]));
  const cierreDe = new Map((cierresDelDia ?? []).map((c) => [c.sucursal_id, c]));
  const nombreSucursal = new Map((sucursales ?? []).map((s) => [s.id, s.nombre]));

  const totalTenant = cierres.reduce((acc, c) => acc + c.totalCobrado, 0);
  const ordenesTenant = cierres.reduce((acc, c) => acc + c.totalOrdenes, 0);

  return (
    <div>
      <PageHeader
        title="Cierre diario"
        action={
          <Link href={`/admin/facturas?fecha=${fecha}`}>
            <Button variant="secondary" size="sm">
              <Receipt className="h-3.5 w-3.5" strokeWidth={2} />
              Ver facturas del día
            </Button>
          </Link>
        }
        subtitle={(sucursales ?? []).length > 1 ? "Comparación entre sucursales — se calcula al vuelo desde los pagos del día, no es una tabla." : "Cierre del día — se calcula al vuelo desde los pagos."}
      />

      {ok && <p role="status" className="mb-4 rounded-lg bg-libre-bg px-3 py-2 text-sm text-libre-text">{ok}</p>}
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <form className="mb-6 flex items-center gap-2">
        <Calendar className="h-4 w-4 text-ink-400" strokeWidth={2} />
        <input
          type="date"
          name="fecha"
          defaultValue={fecha}
          max={hoy}
          aria-label="Fecha"
          className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
        <Button size="sm" variant="dark" type="submit">
          Ver
        </Button>
      </form>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="flex items-center gap-4 p-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Wallet className="h-5 w-5" strokeWidth={2} />
          </div>
          <div>
            <p className="text-xs font-medium text-ink-500">Total del tenant (todas las sucursales)</p>
            <p className="text-2xl font-semibold text-ink-900">L. {totalTenant.toFixed(2)}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4 p-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink-100 text-ink-600">
            <Receipt className="h-5 w-5" strokeWidth={2} />
          </div>
          <div>
            <p className="text-xs font-medium text-ink-500">Órdenes del día (todas las sucursales)</p>
            <p className="text-2xl font-semibold text-ink-900">{ordenesTenant}</p>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {(sucursales ?? []).map((s, idx) => {
          const c = cierres[idx];
          return (
            <Card key={s.id}>
              <CardHeader
                title={s.nombre}
                action={
                  cierreDe.get(s.id) ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-ink-900 px-2.5 py-1 text-xs font-medium text-white">
                      <Lock className="h-3 w-3" strokeWidth={2} />
                      Día cerrado
                    </span>
                  ) : undefined
                }
              />
              <div className="p-5">
                {cierreDe.get(s.id) && (
                  <p className="mb-3 text-xs text-ink-500" data-testid={`cerrado-${s.id}`}>
                    Cerrado el {formatearFechaHora(new Date(cierreDe.get(s.id)!.cerrado_at))}
                    {cierreDe.get(s.id)!.cerrado_por && nombreUsuario.get(cierreDe.get(s.id)!.cerrado_por!) ? ` por ${nombreUsuario.get(cierreDe.get(s.id)!.cerrado_por!)}` : ""}.
                  </p>
                )}
                <div className="mb-4 flex items-end justify-between">
                  <p className="text-2xl font-semibold text-ink-900">L. {c.totalCobrado.toFixed(2)}</p>
                  <p className="flex items-center gap-1 text-sm text-ink-500">
                    <Receipt className="h-3.5 w-3.5" strokeWidth={2} />
                    {c.totalOrdenes} {c.totalOrdenes === 1 ? "orden" : "órdenes"}
                  </p>
                </div>

                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-400">
                  Por forma de pago
                </p>
                <ul className="mb-4 space-y-1.5 text-sm text-ink-700">
                  {Object.entries(c.porFormaPago).map(([forma, monto]) => (
                    <li key={forma} className="flex justify-between capitalize">
                      <span>{forma.replaceAll("_", " ")}</span>
                      <span className="font-medium">L. {monto.toFixed(2)}</span>
                    </li>
                  ))}
                  {Object.keys(c.porFormaPago).length === 0 && (
                    <li className="text-ink-400">Sin cobros ese día.</li>
                  )}
                </ul>

                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-400">Cierre separado</p>
                <div className="mb-4 space-y-3" data-testid={`cierre-separado-${s.id}`}>
                  <BloqueCierre titulo="Facturado (con CAI)" bloque={c.separado.facturado} />
                  <BloqueCierre titulo="No facturado (tickets sin factura)" bloque={c.separado.noFacturado} />
                  {c.separado.anulado.cantidad > 0 && <BloqueCierre titulo="Anulado (no suma a lo cobrado)" bloque={c.separado.anulado} tono="anulado" />}
                  <p className={`flex items-center gap-1.5 text-xs ${c.separado.cuadra ? "text-libre-text" : "font-medium text-red-600"}`}>
                    {c.separado.cuadra ? <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} /> : <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2} />}
                    {c.separado.cuadra
                      ? "Cuadra: facturado + no facturado + anulado = total cobrado, método por método."
                      : "No cuadra con el total cobrado: revisa los pagos de este día."}
                  </p>
                </div>

                {(c.delivery.pedidosEntregados > 0 || c.delivery.liquidaciones > 0) && (
                  <>
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-400">
                      <Bike className="h-3.5 w-3.5" strokeWidth={2} />
                      Delivery
                    </p>
                    <ul className="mb-4 space-y-1.5 text-sm text-ink-700">
                      <li className="flex justify-between"><span>Pedidos entregados</span><span className="font-medium">{c.delivery.pedidosEntregados}</span></li>
                      <li className="flex justify-between"><span>Liquidaciones cerradas</span><span className="font-medium">{c.delivery.liquidaciones}</span></li>
                      <li className="flex justify-between"><span>Efectivo entregado en caja</span><span className="font-medium">L. {c.delivery.efectivoEntregadoEnCaja.toFixed(2)}</span></li>
                      <li className="flex justify-between"><span>Diferencia (entregado − sistema)</span><span className={`font-medium ${c.delivery.diferencia < 0 ? "text-red-600" : ""}`}>L. {c.delivery.diferencia.toFixed(2)}</span></li>
                      {c.delivery.pagoEnvios > 0 && <li className="flex justify-between"><span>Pago a repartidores (envíos)</span><span className="font-medium">L. {c.delivery.pagoEnvios.toFixed(2)}</span></li>}
                    </ul>
                  </>
                )}

                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-400">
                  <Flame className="h-3.5 w-3.5" strokeWidth={2} />
                  Más vendidos
                </p>
                <ul className="mb-5 space-y-1.5 text-sm text-ink-700">
                  {c.productosMasVendidos.map((p) => (
                    <li key={p.nombre} className="flex justify-between">
                      <span>
                        {p.nombre} ×{p.cantidad}
                      </span>
                      <span className="font-medium">L. {p.subtotal.toFixed(2)}</span>
                    </li>
                  ))}
                  {c.productosMasVendidos.length === 0 && (
                    <li className="text-ink-400">Sin ventas ese día.</li>
                  )}
                </ul>

                {!cierreDe.get(s.id) && fecha <= hoy && (
                  <form action={cerrarDia} className="space-y-2 border-t border-ink-100 pt-4">
                    <input type="hidden" name="fecha" value={fecha} />
                    <input type="hidden" name="sucursal_id" value={s.id} />
                    <input
                      name="notas"
                      maxLength={500}
                      placeholder="Nota del cierre (opcional). Ej. faltante de caja, observaciones…"
                      aria-label="Nota del cierre"
                      className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    />
                    <Button type="submit" size="sm" variant="dark">
                      <Lock className="h-3.5 w-3.5" strokeWidth={2} />
                      Hacer cierre diario
                    </Button>
                    <p className="text-xs text-ink-400">Guarda la foto de este día. Antes de cerrar deben estar cobrados los pedidos y resueltas las anulaciones pendientes.</p>
                  </form>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="mt-6">
        <CardHeader title="Reportes en Excel" subtitle="Resumen por día, método de pago, detalle de ventas y productos. Elige el periodo y la sucursal." />
        <form action="/admin/reportes/excel" method="get" className="flex flex-wrap items-end gap-3 p-5">
          <div>
            <label htmlFor="xl-desde" className="mb-1 block text-xs font-medium text-ink-500">Desde</label>
            <input id="xl-desde" type="date" name="desde" defaultValue={primerDiaDelMes(fecha)} max={hoy} className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
          </div>
          <div>
            <label htmlFor="xl-hasta" className="mb-1 block text-xs font-medium text-ink-500">Hasta</label>
            <input id="xl-hasta" type="date" name="hasta" defaultValue={fecha} max={hoy} className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
          </div>
          {(sucursales ?? []).length > 1 && (
            <div>
              <label htmlFor="xl-sucursal" className="mb-1 block text-xs font-medium text-ink-500">Sucursal</label>
              <select id="xl-sucursal" name="sucursal" className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500">
                <option value="">Todas</option>
                {(sucursales ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </div>
          )}
          <Button type="submit" size="sm">
            <FileSpreadsheet className="h-3.5 w-3.5" strokeWidth={2} />
            Descargar Excel
          </Button>
        </form>

        {(ultimosCierres ?? []).length > 0 && (
          <div className="border-t border-ink-100 p-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">Últimos días cerrados</p>
            <ul className="divide-y divide-ink-100 text-sm">
              {ultimosCierres!.map((c) => (
                <li key={c.sucursal_id + c.fecha} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <Link href={`/admin/reportes?fecha=${c.fecha}`} className="font-medium text-ink-900 hover:underline">{c.fecha}</Link>
                  {(sucursales ?? []).length > 1 && <span className="text-ink-500">{nombreSucursal.get(c.sucursal_id)}</span>}
                  <span className="tabular-nums text-ink-700">L. {Number(c.total_cobrado).toFixed(2)}</span>
                  <a
                    href={`/admin/reportes/excel?desde=${c.fecha}&hasta=${c.fecha}&sucursal=${c.sucursal_id}`}
                    className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" strokeWidth={2} />
                    Excel
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}

function BloqueCierre({
  titulo,
  bloque,
  tono = "normal",
}: {
  titulo: string;
  bloque: { cantidad: number; total: number; porFormaPago: Record<string, number> };
  tono?: "normal" | "anulado";
}) {
  return (
    <div className={`rounded-lg border p-3 ${tono === "anulado" ? "border-red-100 bg-red-50/40" : "border-ink-100 bg-ink-50/50"}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-ink-900">{titulo}</p>
        <p className={`text-sm font-semibold tabular-nums ${tono === "anulado" ? "text-red-600" : "text-ink-900"}`}>L. {bloque.total.toFixed(2)}</p>
      </div>
      <p className="mb-1.5 text-xs text-ink-400">
        {bloque.cantidad} {bloque.cantidad === 1 ? "orden" : "órdenes"}
      </p>
      <ul className="space-y-1 text-xs text-ink-600">
        {Object.entries(bloque.porFormaPago).map(([forma, monto]) => (
          <li key={forma} className="flex justify-between capitalize">
            <span>{forma.replaceAll("_", " ")}</span>
            <span className="tabular-nums">L. {monto.toFixed(2)}</span>
          </li>
        ))}
        {Object.keys(bloque.porFormaPago).length === 0 && <li className="text-ink-400">Sin cobros.</li>}
      </ul>
    </div>
  );
}
