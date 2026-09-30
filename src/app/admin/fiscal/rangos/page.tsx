import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { BotonEliminarRango } from "@/components/admin/fiscal/FormulariosFiscales";
import { FormularioRango } from "@/components/admin/fiscal/FormularioRango";
import { resumirRango, type NivelAlerta } from "@/lib/fiscal/alertas";
import { fechaLocalHN, formatearFecha, formatearNumeroDocumento } from "@/lib/fiscal/formato";

const CLASE: Record<string, string> = { factura: "Factura", nota_credito: "Nota de crédito", nota_debito: "Nota de débito" };
const TONO: Record<string, "success" | "warning" | "danger" | "neutral" | "brand"> = {
  activo: "success", pendiente: "brand", agotado: "neutral", vencido: "danger",
};
const NIVEL_TEXTO: Partial<Record<NivelAlerta, string>> = { consumo: "85 % consumido", vencimiento: "por vencer" };

export default async function FiscalRangosPage() {
  const sesion = await requireAdmin();
  const supabase = await createClient();
  const hoy = fechaLocalHN(new Date());

  const [{ data: sucursales }, { data: cajas }, { data: rangos }] = await Promise.all([
    supabase.from("sucursales").select("id, nombre").eq("tenant_id", sesion.tenant_id).eq("activo", true).order("created_at"),
    supabase.from("dispositivos_pos").select("sucursal_id, establecimiento, punto_emision").eq("tenant_id", sesion.tenant_id).eq("activo", true).order("created_at"),
    supabase.from("cai_rangos").select("*").eq("tenant_id", sesion.tenant_id).order("establecimiento").order("punto_emision").order("desde"),
  ]);
  const nombreSucursal = new Map((sucursales ?? []).map((s) => [s.id, s.nombre]));

  // Cada sucursal tiene su caja de cobro (se crea sola): de ahí salen los números del ejemplo
  const opciones = (sucursales ?? []).map((sc) => {
    const caja = (cajas ?? []).find((c) => c.sucursal_id === sc.id);
    return {
      id: sc.id,
      nombre: sc.nombre,
      establecimiento: caja?.establecimiento ?? "000",
      puntoEmision: caja?.punto_emision ?? "001",
    };
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Rangos autorizados"
          subtitle="Un rango activo por caja y tipo de documento. Los pendientes se activan solos cuando el activo se agota o vence."
        />
        <div className="divide-y divide-ink-100">
          {(rangos ?? []).length === 0 && <p className="p-5 text-sm text-ink-500">Todavía no hay rangos. Carga el CAI que te autorizó el SAR abajo.</p>}
          {(rangos ?? []).map((r) => {
            const res = resumirRango(r, hoy);
            const num = (n: number) => formatearNumeroDocumento({ establecimiento: r.establecimiento, puntoEmision: r.punto_emision, tipoDoc: r.tipo_doc, correlativo: n });
            return (
              <div key={r.id} className="flex flex-wrap items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {(sucursales ?? []).length > 1 && <span className="text-sm font-medium text-ink-900">{nombreSucursal.get(r.sucursal_id) ?? "Sucursal"}</span>}
                    <Badge tone="neutral">{CLASE[r.clase] ?? r.clase}</Badge>
                    <Badge tone={TONO[r.estado] ?? "neutral"}>{r.estado}</Badge>
                    {r.estado === "activo" && NIVEL_TEXTO[res.nivel] && <Badge tone="warning">{NIVEL_TEXTO[res.nivel]}</Badge>}
                  </div>
                  <p className="mt-1 break-all font-mono text-xs text-ink-600">{r.cai}</p>
                  <p className="mt-0.5 font-mono text-xs text-ink-500">{num(r.desde)} → {num(r.hasta)}</p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {res.usados.toLocaleString("es-HN")} usados · {res.restantes.toLocaleString("es-HN")} restantes · límite {formatearFecha(r.fecha_limite)}
                  </p>
                </div>
                {r.siguiente === r.desde && <BotonEliminarRango id={r.id} />}
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHeader title="Cargar un rango" subtitle="Copia los datos exactos de la resolución del SAR." />
        <div className="p-5">
          <FormularioRango
            sucursales={opciones}
            hoyHN={hoy}
            existentes={(rangos ?? []).map((r) => ({
              sucursalId: r.sucursal_id,
              tipoDoc: r.tipo_doc,
              desde: r.desde,
              hasta: r.hasta,
            }))}
          />
        </div>
      </Card>
    </div>
  );
}
