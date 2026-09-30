import { requireAdmin } from "@/lib/auth/session";
import { AdminShell } from "@/components/admin/AdminShell";
import { AlertasFiscalesAdmin } from "@/components/admin/AlertasFiscalesAdmin";
import { TutorialOnboarding } from "@/components/admin/TutorialOnboarding";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const sesion = await requireAdmin();

  // null = negocio nuevo que aún no completa el tutorial. Si la consulta falla
  // (p. ej. la migración 0019 todavía no está aplicada) no se muestra nada.
  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("tutorial_completado_at")
    .eq("id", sesion.tenant_id)
    .single();
  const tutorialCompletado = tenant ? !!tenant.tutorial_completado_at : true;

  return (
    <AdminShell usuarioNombre={sesion.nombre} usuarioEmail={sesion.email}>
      <TutorialOnboarding completado={tutorialCompletado} />
      <AlertasFiscalesAdmin tenantId={sesion.tenant_id} />
      {children}
    </AdminShell>
  );
}
