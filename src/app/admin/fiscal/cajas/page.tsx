import { Monitor } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormularioCaja } from "@/components/admin/fiscal/FormulariosFiscales";
import { formatearFechaHora } from "@/lib/fiscal/formato";
import { alternarDispositivo, liberarDispositivo } from "../actions";

export default async function FiscalCajasPage() {
  const sesion = await requireAdmin();
  const supabase = await createClient();

  const [{ data: sucursales }, { data: cajas }] = await Promise.all([
    supabase.from("sucursales").select("id, nombre").eq("tenant_id", sesion.tenant_id).eq("activo", true).order("nombre"),
    supabase.from("dispositivos_pos").select("*").eq("tenant_id", sesion.tenant_id).order("establecimiento").order("punto_emision"),
  ]);
  const nombreSucursal = new Map((sucursales ?? []).map((s) => [s.id, s.nombre]));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Cajas (puntos de emisión)"
          subtitle="Cada caja o tablet factura con su propio punto de emisión y su propio rango CAI. Dos cajas nunca comparten punto."
        />
        <div className="divide-y divide-ink-100">
          {(cajas ?? []).length === 0 && <p className="p-5 text-sm text-ink-500">Todavía no hay cajas. Crea la primera abajo.</p>}
          {(cajas ?? []).map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-ink-500">
                <Monitor className="h-4 w-4" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-900">{c.nombre}</p>
                <p className="text-xs text-ink-500">
                  {nombreSucursal.get(c.sucursal_id) ?? "Sucursal"} · <span className="font-mono">{c.establecimiento}-{c.punto_emision}</span>
                  {c.vinculado_at && <> · vinculada el {formatearFechaHora(new Date(c.vinculado_at))}</>}
                </p>
              </div>
              {!c.activo ? (
                <Badge tone="neutral">desactivada</Badge>
              ) : c.vinculo_hash ? (
                <Badge tone="success">vinculada</Badge>
              ) : (
                <Badge tone="warning">libre</Badge>
              )}
              {c.activo && c.vinculo_hash && (
                <form action={liberarDispositivo.bind(null, c.id)}>
                  <Button size="sm" variant="secondary" type="submit" title="Úsalo si cambiaste el equipo o reinstalaste el POS">
                    Liberar
                  </Button>
                </form>
              )}
              <form action={alternarDispositivo.bind(null, c.id, !c.activo)}>
                <Button size="sm" variant={c.activo ? "danger" : "secondary"} type="submit">
                  {c.activo ? "Desactivar" : "Activar"}
                </Button>
              </form>
            </div>
          ))}
        </div>
        <p className="border-t border-ink-100 px-5 py-3 text-xs text-ink-500">
          Para vincular una caja: abre el POS en ese dispositivo y toca «Vincular esta caja» en el aviso rojo. Si cambias de
          equipo o reinstalas, usa «Liberar» y vuelve a vincularla; el correlativo continúa desde el último emitido.
        </p>
      </Card>

      <Card>
        <CardHeader title="Nueva caja" />
        <div className="p-5">
          <FormularioCaja sucursales={sucursales ?? []} />
        </div>
      </Card>
    </div>
  );
}
