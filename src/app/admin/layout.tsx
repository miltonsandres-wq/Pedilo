import { requireAdmin } from "@/lib/auth/session";
import { AdminShell } from "@/components/admin/AdminShell";
import { AlertasFiscalesAdmin } from "@/components/admin/AlertasFiscalesAdmin";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const sesion = await requireAdmin();

  return (
    <AdminShell usuarioNombre={sesion.nombre} usuarioEmail={sesion.email}>
      <AlertasFiscalesAdmin tenantId={sesion.tenant_id} />
      {children}
    </AdminShell>
  );
}
