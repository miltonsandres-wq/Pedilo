import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader } from "@/components/ui/Card";
import { Colapsable } from "@/components/ui/Colapsable";
import { FormularioEmisor } from "@/components/admin/fiscal/FormulariosFiscales";

export default async function FiscalEmisorPage() {
  const sesion = await requireAdmin();
  const supabase = await createClient();

  const [{ data: sucursales }, { data: emisores }] = await Promise.all([
    supabase.from("sucursales").select("id, nombre").eq("tenant_id", sesion.tenant_id).eq("activo", true).order("nombre"),
    supabase.from("datos_fiscales_emisor").select("*").eq("tenant_id", sesion.tenant_id),
  ]);

  const base = (emisores ?? []).find((e) => e.sucursal_id === null) ?? null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Datos del emisor"
          subtitle="Lo que sale impreso en la factura: razón social, RTN y dirección fiscal tal como están ante el SAR."
        />
        <div className="p-5">
          <FormularioEmisor sucursalId={null} valores={base} />
        </div>
      </Card>

      {(sucursales ?? []).length > 1 && (
        <div>
          <h2 className="mb-1 text-sm font-semibold text-ink-900">Datos propios por sucursal (opcional)</h2>
          <p className="mb-3 text-xs text-ink-500">
            Solo si una sucursal factura con otra razón social, RTN o dirección. Lo que dejes vacío se toma de los datos del negocio.
          </p>
          <div className="space-y-2">
            {(sucursales ?? []).map((s) => {
              const propio = (emisores ?? []).find((e) => e.sucursal_id === s.id) ?? null;
              return (
                <Colapsable
                  key={s.id}
                  resumen={
                    <span className="text-sm font-medium text-ink-900">
                      {s.nombre}
                      {propio && <span className="ml-2 text-xs font-normal text-brand-700">con datos propios</span>}
                    </span>
                  }
                >
                  <FormularioEmisor sucursalId={s.id} valores={propio} heredados={base} />
                </Colapsable>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
