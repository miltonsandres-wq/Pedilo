import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/Card";
import { ImportarMenuPdf } from "@/components/admin/ImportarMenuPdf";

export default async function ImportarMenuPage() {
  const sesion = await requireAdmin();
  const supabase = await createClient();

  const { data: sucursales } = await supabase
    .from("sucursales")
    .select("id, nombre")
    .eq("tenant_id", sesion.tenant_id)
    .eq("activo", true)
    .order("nombre");

  return (
    <div>
      <Link href="/admin/menu" className="mb-4 flex w-fit items-center gap-1.5 text-sm text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" strokeWidth={2} />
        Volver al menú
      </Link>
      <PageHeader title="Importar menú desde PDF" />
      <ImportarMenuPdf sucursales={sucursales ?? []} />
    </div>
  );
}
