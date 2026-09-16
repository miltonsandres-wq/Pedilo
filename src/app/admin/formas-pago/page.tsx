import { Banknote, CreditCard, ArrowLeftRight } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, PageHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/ui";
import { actualizarFormasPago } from "./actions";

const TODAS = [
  { valor: "efectivo", etiqueta: "Efectivo", icon: Banknote },
  { valor: "tarjeta", etiqueta: "Tarjeta", icon: CreditCard },
  { valor: "transferencia", etiqueta: "Transferencia", icon: ArrowLeftRight },
] as const;

export default async function FormasPagoPage() {
  const sesion = await requireAdmin();
  const supabase = await createClient();

  const [{ data: sucursales }, { data: config }] = await Promise.all([
    supabase.from("sucursales").select("id, nombre").eq("tenant_id", sesion.tenant_id),
    supabase.from("formas_pago_sucursal").select("*"),
  ]);

  const activasPorSucursal = new Map<string, Set<string>>();
  for (const c of config ?? []) {
    if (!c.activo) continue;
    const set = activasPorSucursal.get(c.sucursal_id) ?? new Set<string>();
    set.add(c.forma_pago);
    activasPorSucursal.set(c.sucursal_id, set);
  }

  return (
    <div>
      <PageHeader title="Formas de pago" subtitle="Qué acepta cada sucursal a la hora de cobrar." />
      <div className="space-y-4">
        {(sucursales ?? []).map((s) => (
          <Card key={s.id}>
            <CardHeader title={s.nombre} />
            <form action={actualizarFormasPago.bind(null, s.id)} className="p-5 pt-4">
              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {TODAS.map((f) => {
                  const activa = activasPorSucursal.get(s.id)?.has(f.valor);
                  const Icon = f.icon;
                  return (
                    <label
                      key={f.valor}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition",
                        activa
                          ? "border-brand-300 bg-brand-50 text-brand-800"
                          : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
                      )}
                    >
                      <input
                        type="checkbox"
                        name="formas"
                        value={f.valor}
                        defaultChecked={activa}
                        className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                      />
                      <Icon className="h-4 w-4" strokeWidth={2} />
                      {f.etiqueta}
                    </label>
                  );
                })}
              </div>
              <Button size="sm">Guardar</Button>
            </form>
          </Card>
        ))}
        {(sucursales ?? []).length === 0 && (
          <p className="text-sm text-ink-500">Crea primero una sucursal.</p>
        )}
      </div>
    </div>
  );
}
