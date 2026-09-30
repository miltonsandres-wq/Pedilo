"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function crearSucursal(formData: FormData) {
  const sesion = await requireAdmin();
  const supabase = await createClient();

  // El plan del tenant (ver 0012_plataforma_admin.sql) pone un tope a cuántas
  // sucursales puede tener sin hablar con soporte — abrir una más de las que
  // paga es justo el caso que tiene que pasar por /plataforma, no colarse
  // gratis por este formulario.
  const [{ count }, { data: tenant }] = await Promise.all([
    supabase.from("sucursales").select("*", { count: "exact", head: true }).eq("tenant_id", sesion.tenant_id),
    supabase.from("tenants").select("max_sucursales").eq("id", sesion.tenant_id).single(),
  ]);

  if (tenant && (count ?? 0) >= tenant.max_sucursales) {
    redirect("/admin/sucursales?errorPlan=1");
  }

  await supabase.from("sucursales").insert({
    tenant_id: sesion.tenant_id,
    nombre: String(formData.get("nombre") ?? ""),
    direccion: String(formData.get("direccion") ?? "") || null,
    telefono: String(formData.get("telefono") ?? "") || null,
  });

  revalidatePath("/admin/sucursales");
}

export async function actualizarSucursal(id: string, formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();

  await supabase
    .from("sucursales")
    .update({
      nombre: String(formData.get("nombre") ?? ""),
      direccion: String(formData.get("direccion") ?? "") || null,
      telefono: String(formData.get("telefono") ?? "") || null,
      agente_impresion_url: String(formData.get("agente_impresion_url") ?? "") || null,
    })
    .eq("id", id);

  revalidatePath("/admin/sucursales");
}

export async function desactivarSucursal(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("sucursales").update({ activo: false }).eq("id", id);
  revalidatePath("/admin/sucursales");
}

/**
 * Persiste la URL pública del logo de UNA sucursal ya subido a Storage (ver
 * SucursalLogoUploader). El menú del QR (/carta/[token]) lo usa tal cual —
 * sin ningún logo "del negocio" al cual caer de respaldo.
 */
export async function actualizarLogoSucursal(sucursalId: string, logoUrl: string | null) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("sucursales").update({ logo_url: logoUrl }).eq("id", sucursalId);
  revalidatePath("/admin/sucursales");
}
