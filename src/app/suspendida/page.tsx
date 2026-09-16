import { redirect } from "next/navigation";
import { Lock, MessageCircle, Wallet } from "lucide-react";
import { getSesion } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { BrandMark } from "@/components/BrandMark";
import { CerrarSesionBoton } from "@/components/CerrarSesionBoton";
import { buttonClass } from "@/lib/ui";
import { linkWhatsapp } from "@/lib/whatsapp";

const NOMBRE_PLAN: Record<string, string> = {
  plan_1: "1 sucursal",
  plan_2: "2 sucursales",
  compra_unica: "Compra única",
  personalizado: "Plan personalizado",
};

/**
 * A esta pantalla llega cualquier usuario (admin/cajero/mesero) de un tenant
 * cuya prueba de 15 días venció, cuya mensualidad venció, o al que vos
 * suspendiste a mano desde /plataforma (ver bloqueadoPorSuscripcion en
 * lib/auth/session.ts). No usa requireAdmin/requireSucursal a propósito —
 * esos redirigen justo aquí, así que crearía un loop.
 */
export default async function SuspendidaPage() {
  const sesion = await getSesion();
  if (!sesion) redirect("/login");

  const admin = createAdminClient();
  const [{ data: tenant }, { data: formasPago }] = await Promise.all([
    admin
      .from("tenants")
      .select("plan, precio_mensual, suscripcion_estado, prueba_vence_el, suscripcion_vence_el")
      .eq("id", sesion.tenant_id)
      .single(),
    admin
      .from("formas_pago_plataforma")
      .select("descripcion")
      .eq("activo", true)
      .order("orden"),
  ]);

  // Si ya está al día (alguien llegó a esta URL directo, o vos ya lo
  // reactivaste), no lo dejamos varado aquí.
  if (tenant) {
    const vencida =
      tenant.suscripcion_estado === "suspendida" ||
      (tenant.suscripcion_estado === "prueba" &&
        tenant.prueba_vence_el &&
        new Date(tenant.prueba_vence_el) < new Date()) ||
      (tenant.suscripcion_estado === "activa" &&
        tenant.suscripcion_vence_el &&
        new Date(tenant.suscripcion_vence_el) < new Date());
    if (!vencida) redirect("/");
  }

  const titulo =
    tenant?.suscripcion_estado === "suspendida"
      ? "Tu cuenta está suspendida"
      : tenant?.suscripcion_estado === "prueba"
        ? "Tu período de prueba terminó"
        : "Tu suscripción venció";

  const mensajeWhatsapp = `Hola, soy ${sesion.nombre} y quiero reactivar mi cuenta de Pedilo (${sesion.email ?? "sin correo"}).`;

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-6 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-ink-100 bg-white p-7 text-center shadow-card">
        <div className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-ink-900">
          <Lock className="h-5 w-5 text-white" strokeWidth={2} />
        </div>
        <h1 className="mb-1 text-lg font-semibold text-ink-900">{titulo}</h1>
        <p className="mb-6 text-sm text-ink-500">
          Escribinos por WhatsApp y te reactivamos la cuenta en minutos.
        </p>

        {tenant && (
          <div className="mb-5 rounded-xl border border-ink-100 bg-ink-50/60 p-4 text-left text-sm">
            <div className="flex items-center justify-between">
              <span className="text-ink-500">Plan</span>
              <span className="font-medium text-ink-900">{NOMBRE_PLAN[tenant.plan] ?? tenant.plan}</span>
            </div>
            {tenant.precio_mensual != null && (
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-ink-500">Precio</span>
                <span className="font-medium text-ink-900">L {Number(tenant.precio_mensual).toLocaleString("es-HN")}/mes</span>
              </div>
            )}
          </div>
        )}

        {formasPago && formasPago.length > 0 && (
          <div className="mb-6 rounded-xl border border-ink-100 p-4 text-left">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
              <Wallet className="h-3.5 w-3.5" strokeWidth={2} />
              Formas de pago
            </p>
            <ul className="space-y-1 text-sm text-ink-700">
              {formasPago.map((f) => (
                <li key={f.descripcion}>{f.descripcion}</li>
              ))}
            </ul>
          </div>
        )}

        <a
          href={linkWhatsapp(mensajeWhatsapp)}
          target="_blank"
          rel="noopener noreferrer"
          className={`${buttonClass("primary", "lg")} w-full`}
        >
          <MessageCircle className="h-4 w-4" strokeWidth={2} />
          Reactivar por WhatsApp
        </a>

        <div className="mt-5 flex items-center justify-center gap-2 text-xs text-ink-400">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-brand-600">
            <BrandMark className="h-3 w-3 text-white" />
          </div>
          Pedilo
          <span className="mx-1">·</span>
          <CerrarSesionBoton compact={false} />
        </div>
      </div>
    </div>
  );
}
