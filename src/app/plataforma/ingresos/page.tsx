import { DollarSign, Calendar, Users } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardHeader, PageHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { estadoTenant } from "../shared";

const TIPO_LABEL: Record<string, string> = {
  mensual: "Mensualidad",
  compra_unica: "Compra única",
  otro: "Otro",
};
const TIPO_TONE = { mensual: "brand", compra_unica: "success", otro: "neutral" } as const;

function formatoLempiras(monto: number) {
  return `L ${monto.toLocaleString("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function IngresosPage() {
  const admin = createAdminClient();

  const [{ data: pagos }, { data: tenants }] = await Promise.all([
    admin.from("pagos_plataforma").select("*").order("fecha_pago", { ascending: false }),
    admin
      .from("tenants")
      .select("id, nombre, suscripcion_estado, prueba_vence_el, suscripcion_vence_el"),
  ]);

  const nombrePorTenant = new Map((tenants ?? []).map((t) => [t.id, t.nombre]));

  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  const totalHistorico = (pagos ?? []).reduce((sum, p) => sum + Number(p.monto), 0);
  const totalMes = (pagos ?? [])
    .filter((p) => new Date(p.fecha_pago) >= inicioMes)
    .reduce((sum, p) => sum + Number(p.monto), 0);
  const clientesAlDia = (tenants ?? []).filter((t) => estadoTenant(t).alDia).length;

  const totalesPorCliente = new Map<string, number>();
  for (const p of pagos ?? []) {
    totalesPorCliente.set(p.tenant_id, (totalesPorCliente.get(p.tenant_id) ?? 0) + Number(p.monto));
  }
  const porCliente = [...totalesPorCliente.entries()]
    .map(([tenantId, total]) => ({ tenantId, nombre: nombrePorTenant.get(tenantId) ?? "—", total }))
    .sort((a, b) => b.total - a.total);
  const maxPorCliente = porCliente[0]?.total ?? 0;

  return (
    <div>
      <PageHeader title="Ingresos" subtitle="Lo que te han pagado tus clientes, mensualidad y compras únicas." />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-500">
            <Calendar className="h-3.5 w-3.5" strokeWidth={2} />
            Este mes
          </p>
          <p className="text-3xl font-semibold text-ink-900">{formatoLempiras(totalMes)}</p>
        </Card>
        <Card className="p-5">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-500">
            <DollarSign className="h-3.5 w-3.5" strokeWidth={2} />
            Histórico
          </p>
          <p className="text-3xl font-semibold text-ink-900">{formatoLempiras(totalHistorico)}</p>
        </Card>
        <Card className="p-5">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-500">
            <Users className="h-3.5 w-3.5" strokeWidth={2} />
            Clientes al día
          </p>
          <p className="text-3xl font-semibold text-ink-900">
            {clientesAlDia}
            <span className="text-base font-normal text-ink-400"> / {(tenants ?? []).length}</span>
          </p>
        </Card>
      </div>

      <Card className="mb-8">
        <CardHeader title="Ingresos por cliente" subtitle="Total pagado histórico, de mayor a menor." />
        <div className="space-y-3 p-5">
          {porCliente.map((c) => (
            <div key={c.tenantId} className="flex items-center gap-3">
              <p className="w-32 shrink-0 truncate text-sm text-ink-700">{c.nombre}</p>
              <div className="h-5 flex-1 overflow-hidden rounded-r-full bg-ink-50">
                <div
                  className="h-5 rounded-r-full bg-brand-600"
                  style={{ width: maxPorCliente ? `${(c.total / maxPorCliente) * 100}%` : "0%" }}
                />
              </div>
              <p className="w-28 shrink-0 text-right text-sm font-medium tabular-nums text-ink-900">
                {formatoLempiras(c.total)}
              </p>
            </div>
          ))}
          {porCliente.length === 0 && (
            <p className="py-2 text-center text-sm text-ink-400">Todavía no hay pagos registrados.</p>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Pagos recientes" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                <th className="px-5 py-2.5">Fecha</th>
                <th className="px-5 py-2.5">Cliente</th>
                <th className="px-5 py-2.5">Tipo</th>
                <th className="px-5 py-2.5 text-right">Monto</th>
                <th className="px-5 py-2.5">Notas</th>
              </tr>
            </thead>
            <tbody>
              {(pagos ?? []).map((p) => (
                <tr key={p.id} className="border-b border-ink-50 last:border-0">
                  <td className="px-5 py-2.5 tabular-nums text-ink-500">{p.fecha_pago}</td>
                  <td className="px-5 py-2.5 font-medium text-ink-900">{nombrePorTenant.get(p.tenant_id) ?? "—"}</td>
                  <td className="px-5 py-2.5">
                    <Badge tone={TIPO_TONE[p.tipo as keyof typeof TIPO_TONE] ?? "neutral"}>
                      {TIPO_LABEL[p.tipo] ?? p.tipo}
                    </Badge>
                  </td>
                  <td className="px-5 py-2.5 text-right font-medium tabular-nums text-ink-900">
                    {formatoLempiras(Number(p.monto))}
                  </td>
                  <td className="px-5 py-2.5 text-ink-500">{p.notas ?? "—"}</td>
                </tr>
              ))}
              {(pagos ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-sm text-ink-400">
                    Todavía no hay pagos registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
