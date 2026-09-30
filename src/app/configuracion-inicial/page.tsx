import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fechaLocalHN } from "@/lib/fiscal/formato";
import { AsistenteInicial } from "@/components/onboarding/AsistenteInicial";

/**
 * Configuración inicial de un negocio recién registrado: datos de cada
 * sucursal, logo y, si factura con CAI, los datos fiscales y su rango. Vive
 * fuera de /admin para no mostrar el panel a medias.
 */
export default async function ConfiguracionInicialPage() {
  const sesion = await requireAdmin();
  const supabase = await createClient();

  // Si ya la hizo (o la columna aún no existe) no hay nada que pedir
  const { data: tenant } = await supabase
    .from("tenants")
    .select("nombre, configuracion_inicial_at")
    .eq("id", sesion.tenant_id)
    .single();
  if (!tenant || tenant.configuracion_inicial_at) redirect("/admin");

  const { data: sucursales } = await supabase
    .from("sucursales")
    .select("id, nombre, telefono, direccion, logo_url")
    .eq("tenant_id", sesion.tenant_id)
    .eq("activo", true)
    .order("created_at");

  return (
    <AsistenteInicial
      negocio={tenant.nombre}
      hoyHN={fechaLocalHN(new Date())}
      sucursales={(sucursales ?? []).map((s) => ({
        id: s.id,
        nombre: s.nombre,
        telefono: s.telefono ?? "",
        direccion: s.direccion ?? "",
        logoUrl: s.logo_url,
      }))}
    />
  );
}
