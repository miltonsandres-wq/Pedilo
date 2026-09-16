"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RolUsuario } from "@/lib/types/helpers";

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

function generarClaveTemporal() {
  return randomBytes(6).toString("base64url");
}

/**
 * Da de alta un cajero/mesero (o admin): crea su usuario de Supabase Auth
 * con una contraseña temporal y su fila en `usuarios` (tenant/rol/sucursal).
 * Se llama desde el formulario de personal de cada sucursal (rol fijo
 * cajero/mesero, sucursal implícita) y desde el de administradores (rol
 * admin, sin sucursal). Requiere la service_role key porque crear usuarios
 * de Auth no es algo que un usuario común pueda hacer (se salta RLS a
 * propósito, solo aquí).
 */
export async function crearUsuario(formData: FormData) {
  const sesion = await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const nombre = String(formData.get("nombre") ?? "");
  const rol = String(formData.get("rol") ?? "mesero") as RolUsuario;
  const sucursalId = String(formData.get("sucursal_id") ?? "") || null;

  if (rol !== "admin" && !sucursalId) {
    throw new Error("Cajero/mesero necesita una sucursal asignada.");
  }

  const admin = createAdminClient();
  const claveTemporal = generarClaveTemporal();

  const { data: authUser, error } = await admin.auth.admin.createUser({
    email,
    password: claveTemporal,
    email_confirm: true,
  });

  if (error || !authUser.user) {
    throw new Error(error?.message ?? "No se pudo crear el usuario de acceso.");
  }

  const supabase = await createClient();
  const { error: errorPerfil } = await supabase.from("usuarios").insert({
    id: authUser.user.id,
    tenant_id: sesion.tenant_id,
    sucursal_id: rol === "admin" ? null : sucursalId,
    rol,
    nombre,
  });

  if (errorPerfil) {
    await admin.auth.admin.deleteUser(authUser.user.id);
    throw new Error(errorPerfil.message);
  }

  revalidatePath("/admin/sucursales");
  redirect(
    `/admin/sucursales?nuevoEmail=${encodeURIComponent(email)}&nuevaClave=${encodeURIComponent(claveTemporal)}`
  );
}

export async function actualizarUsuario(id: string, formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const rol = String(formData.get("rol") ?? "mesero") as RolUsuario;
  const sucursalId = String(formData.get("sucursal_id") ?? "") || null;

  await supabase
    .from("usuarios")
    .update({
      nombre: String(formData.get("nombre") ?? ""),
      rol,
      sucursal_id: rol === "admin" ? null : sucursalId,
      activo: formData.get("activo") === "on",
    })
    .eq("id", id);

  revalidatePath("/admin/sucursales");
}
