import { requireAdmin } from "@/lib/auth/session";
import { AdminShell } from "@/components/admin/AdminShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const sesion = await requireAdmin();

  return (
    <AdminShell usuarioNombre={sesion.nombre} usuarioEmail={sesion.email}>
      {children}
    </AdminShell>
  );
}
