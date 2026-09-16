import { Wallet, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/session";
import { obtenerCierreDiario, rangoDelDia } from "@/lib/reportes/cierreDiario";
import { PageHeader, Card } from "@/components/ui/Card";

export default async function AdminResumenPage() {
  const sesion = await requireAdmin();
  const supabase = await createClient();

  const { data: sucursales } = await supabase
    .from("sucursales")
    .select("*")
    .eq("tenant_id", sesion.tenant_id)
    .eq("activo", true)
    .order("nombre");

  const { desde, hasta } = rangoDelDia();
  const cierres = await Promise.all(
    (sucursales ?? []).map((s) => obtenerCierreDiario(supabase, { sucursalId: s.id, desde, hasta }))
  );
  const totalHoy = cierres.reduce((acc, c) => acc + c.totalCobrado, 0);

  return (
    <div>
      <PageHeader title={`Hola, ${sesion.nombre.split(" ")[0]}`} subtitle="Así va el negocio hoy." />

      <Card className="mb-6 flex items-center gap-4 p-5">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <TrendingUp className="h-5 w-5" strokeWidth={2} />
        </div>
        <div>
          <p className="text-xs font-medium text-ink-500">Cobrado hoy (todas las sucursales)</p>
          <p className="text-2xl font-semibold text-ink-900">L. {totalHoy.toFixed(2)}</p>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(sucursales ?? []).map((s, idx) => {
          const c = cierres[idx];
          return (
            <Card key={s.id} className="p-5">
              <p className="text-sm font-medium text-ink-500">{s.nombre}</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-ink-900">
                L. {c.totalCobrado.toFixed(2)}
              </p>
              <ul className="mt-4 space-y-1.5 border-t border-ink-100 pt-3 text-xs text-ink-500">
                {Object.entries(c.porFormaPago).map(([forma, monto]) => (
                  <li key={forma} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 capitalize">
                      <Wallet className="h-3.5 w-3.5 text-ink-400" strokeWidth={2} />
                      {forma}
                    </span>
                    <span className="font-medium text-ink-700">L. {monto.toFixed(2)}</span>
                  </li>
                ))}
                {Object.keys(c.porFormaPago).length === 0 && <li>Sin cobros todavía.</li>}
              </ul>
            </Card>
          );
        })}
        {(sucursales ?? []).length === 0 && (
          <p className="text-sm text-ink-500">
            Todavía no tienes sucursales. Crea la primera en “Sucursales”.
          </p>
        )}
      </div>
    </div>
  );
}
