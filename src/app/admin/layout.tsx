import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { AdminShell } from "@/components/admin/AdminShell";
import { AlertasFiscalesAdmin } from "@/components/admin/AlertasFiscalesAdmin";
import { TutorialOnboarding } from "@/components/admin/TutorialOnboarding";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const sesion = await requireAdmin();
  const supabase = await createClient();

  // Negocio recién registrado: primero su configuración inicial (datos, logo, CAI).
  // Si la consulta falla (p. ej. la migración 0020 todavía no está aplicada) no se pide nada.
  const { data: configuracion } = await supabase
    .from("tenants")
    .select("configuracion_inicial_at")
    .eq("id", sesion.tenant_id)
    .single();
  if (configuracion && !configuracion.configuracion_inicial_at) redirect("/configuracion-inicial");

  // null = negocio nuevo que aún no completa el tutorial. Si la consulta falla
  // (p. ej. la migración 0019 todavía no está aplicada) no se muestra nada.
  const { data: tenant } = await supabase
    .from("tenants")
    .select("tutorial_completado_at, delivery_habilitado")
    .eq("id", sesion.tenant_id)
    .single();
  const tutorialCompletado = tenant ? !!tenant.tutorial_completado_at : true;

  // Anulaciones que la caja pidió y esperan aprobación (si la tabla aún no existe, simplemente no hay aviso)
  const { count: anulacionesPendientes } = await supabase
    .from("solicitudes_anulacion")
    .select("id", { count: "exact", head: true })
    .eq("estado", "pendiente");

  return (
    <AdminShell usuarioNombre={sesion.nombre} usuarioEmail={sesion.email} deliveryHabilitado={tenant?.delivery_habilitado === true}
      anulacionesPendientes={anulacionesPendientes ?? 0}
    >
      <TutorialOnboarding completado={tutorialCompletado} tenantId={sesion.tenant_id} />
      <AlertasFiscalesAdmin tenantId={sesion.tenant_id} />
      {children}
    </AdminShell>
  );
}
