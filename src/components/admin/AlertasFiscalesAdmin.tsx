import Link from "next/link";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { alertasPorPunto, MENSAJES_ALERTA } from "@/lib/fiscal/alertas";
import { fechaLocalHN } from "@/lib/fiscal/formato";

/**
 * Notificación al dueño (arriba de todo el panel) cuando la facturación fiscal
 * está activa y algún rango llegó al 85 %, está a 30 días de vencer, ya bloqueó
 * el cobro (agotado/vencido) o hay incidentes de sincronización sin revisar.
 * No renderiza nada si todo está en orden o el negocio no factura.
 */
export async function AlertasFiscalesAdmin({ tenantId }: { tenantId: string }) {
  const supabase = await createClient();

  const { data: tenant } = await supabase.from("tenants").select("facturacion_fiscal_activa").eq("id", tenantId).single();
  if (!tenant?.facturacion_fiscal_activa) return null;

  const [{ data: rangos }, { count: incidentes }, { data: sucursales }] = await Promise.all([
    supabase.from("cai_rangos").select("*").eq("tenant_id", tenantId),
    supabase.from("incidentes_fiscales").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("resuelto", false),
    supabase.from("sucursales").select("id, nombre").eq("tenant_id", tenantId),
  ]);

  const nombre = new Map((sucursales ?? []).map((s) => [s.id, s.nombre]));
  const alertas = alertasPorPunto(rangos ?? [], fechaLocalHN(new Date())).filter((a) => a.nivel !== "ok");
  if (alertas.length === 0 && !incidentes) return null;

  const bloqueantes = (n: string) => n === "agotado" || n === "vencido";

  return (
    <div className="mb-6 space-y-2">
      {alertas.map((a) => (
        <Link
          key={a.clave}
          href="/admin/fiscal/rangos"
          className={
            bloqueantes(a.nivel)
              ? "flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 hover:bg-red-100"
              : "flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 hover:bg-amber-100"
          }
        >
          {bloqueantes(a.nivel) ? (
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
          )}
          <span>
            <b>{nombre.get(a.sucursal_id) ?? "Sucursal"} · caja {a.establecimiento}-{a.punto_emision}:</b>{" "}
            {MENSAJES_ALERTA[a.nivel as Exclude<typeof a.nivel, "ok">]}{" "}
            {!bloqueantes(a.nivel) && `Quedan ${a.resumen.restantes} documentos y ${Math.max(0, a.resumen.diasParaVencer)} días.`}
          </span>
        </Link>
      ))}
      {!!incidentes && (
        <Link
          href="/admin/fiscal"
          className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 hover:bg-red-100"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
          <span>
            <b>{incidentes} incidente(s) fiscal(es) sin resolver:</b> el servidor rechazó documentos al sincronizar. Revísalos.
          </span>
        </Link>
      )}
    </div>
  );
}
