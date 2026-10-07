import Link from "next/link";
import { ArrowLeft, Bike, CircleX, Clock, PackageCheck } from "lucide-react";
import { requireDeliveryAdmin } from "@/lib/delivery/habilitado";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, PageHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn, inputClass, labelClass } from "@/lib/ui";
import { obtenerReporteDelivery, rangoFechasHN } from "@/lib/delivery/reportes";
import { formatearLempiras } from "@/lib/delivery/validaciones";

const hoyHN = () => new Date(Date.now() - 6 * 3600_000).toISOString().slice(0, 10);
const min = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("es-HN", { maximumFractionDigits: 1 })} min`);

export default async function ReporteDeliveryPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; sucursal?: string }>;
}) {
  const sesion = await requireDeliveryAdmin();
  const q = await searchParams;
  const supabase = await createClient();

  const hoy = hoyHN();
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(q.desde ?? "") ? q.desde! : hoy.slice(0, 8) + "01";
  const hasta = /^\d{4}-\d{2}-\d{2}$/.test(q.hasta ?? "") ? q.hasta! : hoy;

  const { data: sucursales } = await supabase.from("sucursales").select("id, nombre").eq("tenant_id", sesion.tenant_id).eq("activo", true).order("nombre");
  const sucursalId = (sucursales ?? []).some((s) => s.id === q.sucursal) ? q.sucursal! : null;

  const r = await obtenerReporteDelivery(supabase, { sucursalId, ...rangoFechasHN(desde, hasta) });

  const tarjeta = (titulo: string, valor: string, Icono: typeof Bike, tono = "bg-brand-50 text-brand-600") => (
    <Card className="flex items-center gap-4 p-5">
      <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl", tono)}><Icono className="h-5 w-5" strokeWidth={2} /></div>
      <div><p className="text-xs font-medium text-ink-500">{titulo}</p><p className="text-2xl font-semibold text-ink-900">{valor}</p></div>
    </Card>
  );

  return (
    <div>
      <PageHeader title="Reporte de delivery" subtitle="Pedidos por repartidor, tiempos promedio y cancelaciones." />
      <Link href="/admin/delivery" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-800"><ArrowLeft className="h-4 w-4" /> Volver a delivery</Link>

      <form className="mb-6 flex flex-wrap items-end gap-3">
        <div><label htmlFor="desde" className={labelClass}>Desde</label><input id="desde" type="date" name="desde" defaultValue={desde} className={inputClass} /></div>
        <div><label htmlFor="hasta" className={labelClass}>Hasta</label><input id="hasta" type="date" name="hasta" defaultValue={hasta} className={inputClass} /></div>
        {(sucursales ?? []).length > 1 && (
          <div>
            <label htmlFor="suc" className={labelClass}>Sucursal</label>
            <select id="suc" name="sucursal" defaultValue={sucursalId ?? ""} className={inputClass}>
              <option value="">Todas</option>
              {(sucursales ?? []).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
        )}
        <Button size="sm" variant="dark">Ver</Button>
      </form>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tarjeta("Pedidos", String(r.totalPedidos), Bike)}
        {tarjeta("Entregados", String(r.entregados), PackageCheck, "bg-libre-bg text-libre-text")}
        {tarjeta("Cancelados / rechazados", `${r.cancelados + r.rechazados} (${r.tasaCancelacion}%)`, CircleX, "bg-red-50 text-red-600")}
        {tarjeta("Envíos cobrados", formatearLempiras(r.ventasEnvio), Clock, "bg-ink-100 text-ink-600")}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Tiempos promedio" />
          <dl className="space-y-2 p-5 text-sm">
            <div className="flex justify-between"><dt className="text-ink-600">Recibido → aceptado</dt><dd className="font-semibold">{min(r.tiempos.recibidoAAceptadoMin)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-600">Aceptado → listo</dt><dd className="font-semibold">{min(r.tiempos.aceptadoAListoMin)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-600">En camino → entregado</dt><dd className="font-semibold">{min(r.tiempos.enCaminoAEntregadoMin)}</dd></div>
          </dl>
        </Card>

        <Card>
          <CardHeader title="Motivos de cancelación" />
          <ul className="space-y-2 p-5 text-sm">
            {r.motivosCancelacion.map((m) => <li key={m.motivo} className="flex justify-between"><span className="text-ink-700">{m.motivo}</span><span className="font-semibold">{m.cantidad}</span></li>)}
            {r.motivosCancelacion.length === 0 && <li className="text-ink-400">Sin cancelaciones en este rango.</li>}
          </ul>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Por repartidor" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ink-400">
              <tr><th className="px-5 py-3">Repartidor</th><th className="px-3 py-3 text-right">Entregas</th><th className="px-3 py-3 text-right">Tiempo prom.</th><th className="px-3 py-3 text-right">Efectivo cobrado</th><th className="px-5 py-3 text-right">Total cobrado</th></tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {r.porRepartidor.map((f) => (
                <tr key={f.repartidorId}>
                  <td className="px-5 py-3 font-medium text-ink-900">{f.nombre}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{f.entregados}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{min(f.minutosEntregaPromedio)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatearLempiras(f.efectivoCobrado)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{formatearLempiras(f.totalCobrado)}</td>
                </tr>
              ))}
              {r.porRepartidor.length === 0 && <tr><td colSpan={5} className="px-5 py-6 text-center text-ink-400">Sin entregas en este rango.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
