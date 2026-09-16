import { Wallet, Flame, Calendar } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { obtenerCierreDiario, rangoDelDia } from "@/lib/reportes/cierreDiario";
import { Card, CardHeader, PageHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const sesion = await requireAdmin();
  const supabase = await createClient();
  const { fecha: fechaParam } = await searchParams;

  const fecha = fechaParam ? new Date(fechaParam) : new Date();
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

  const totalTenant = cierres.reduce((acc, c) => acc + c.totalCobrado, 0);

  return (
    <div>
      <PageHeader
        title="Cierre diario"
        subtitle="Comparación entre sucursales — se calcula al vuelo desde los pagos del día, no es una tabla."
      />

      <form className="mb-6 flex items-center gap-2">
        <Calendar className="h-4 w-4 text-ink-400" strokeWidth={2} />
        <input
          type="date"
          name="fecha"
          defaultValue={fecha.toISOString().slice(0, 10)}
          className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
        <Button size="sm" variant="dark" type="submit">
          Ver
        </Button>
      </form>

      <Card className="mb-6 flex items-center gap-4 p-5">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Wallet className="h-5 w-5" strokeWidth={2} />
        </div>
        <div>
          <p className="text-xs font-medium text-ink-500">Total del tenant (todas las sucursales)</p>
          <p className="text-2xl font-semibold text-ink-900">L. {totalTenant.toFixed(2)}</p>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {(sucursales ?? []).map((s, idx) => {
          const c = cierres[idx];
          return (
            <Card key={s.id}>
              <CardHeader title={s.nombre} />
              <div className="p-5">
                <p className="mb-4 text-2xl font-semibold text-ink-900">
                  L. {c.totalCobrado.toFixed(2)}
                </p>

                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-400">
                  Por forma de pago
                </p>
                <ul className="mb-4 space-y-1.5 text-sm text-ink-700">
                  {Object.entries(c.porFormaPago).map(([forma, monto]) => (
                    <li key={forma} className="flex justify-between capitalize">
                      <span>{forma}</span>
                      <span className="font-medium">L. {monto.toFixed(2)}</span>
                    </li>
                  ))}
                  {Object.keys(c.porFormaPago).length === 0 && (
                    <li className="text-ink-400">Sin cobros ese día.</li>
                  )}
                </ul>

                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-400">
                  <Flame className="h-3.5 w-3.5" strokeWidth={2} />
                  Más vendidos
                </p>
                <ul className="space-y-1.5 text-sm text-ink-700">
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
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
