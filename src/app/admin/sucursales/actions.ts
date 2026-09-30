"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RolUsuario } from "@/lib/types/helpers";
import { cifrarClave, descifrarClave, generarClaveTemporal, validarClave } from "@/lib/auth/clave";
import { mensajeErrorUsuario } from "@/lib/auth/errores";

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

/**
 * Da de alta un cajero/mesero (o admin): crea su usuario de Supabase Auth con
 * la contraseña que escribe el admin (si la deja vacía se genera una) y su fila
 * en `usuarios` (tenant/rol/sucursal). La contraseña queda CIFRADA en la fila
 * para que el admin pueda volver a verla (ver verClaveUsuario). Requiere la
 * service_role key porque crear usuarios de Auth no es algo que un usuario
 * común pueda hacer (se salta RLS a propósito, solo aquí).
 */
const irConError = (mensaje: string) => redirect(`/admin/sucursales?errorUsuario=${encodeURIComponent(mensaje)}`);

export async function crearUsuario(formData: FormData) {
  const sesion = await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const nombre = String(formData.get("nombre") ?? "");
  const rol = String(formData.get("rol") ?? "mesero") as RolUsuario;
  const sucursalId = String(formData.get("sucursal_id") ?? "") || null;
  const claveEscrita = String(formData.get("clave") ?? "");

  if (!email || !nombre.trim()) irConError("Escribe el nombre y el correo de la persona.");
  if (rol !== "admin" && !sucursalId) irConError("Cajero/mesero necesita una sucursal asignada.");
  if (claveEscrita) {
    const problema = validarClave(claveEscrita);
    if (problema) redirect(`/admin/sucursales?errorClave=${encodeURIComponent(problema)}`);
  }

  const admin = createAdminClient();
  const clave = claveEscrita || generarClaveTemporal();

  const { data: authUser, error } = await admin.auth.admin.createUser({
    email,
    password: clave,
    email_confirm: true,
  });

  if (error || !authUser?.user) {
    irConError(mensajeErrorUsuario(error?.message, (error as { code?: string } | null)?.code));
    return;
  }

  const supabase = await createClient();
  const { error: errorPerfil } = await supabase.from("usuarios").insert({
    id: authUser.user.id,
    tenant_id: sesion.tenant_id,
    sucursal_id: rol === "admin" ? null : sucursalId,
    rol,
    nombre,
    clave_cifrada: cifrarClave(clave),
  });

  if (errorPerfil) {
    await admin.auth.admin.deleteUser(authUser.user.id);
    irConError("No se pudo guardar al usuario. Intenta de nuevo.");
  }

  revalidatePath("/admin/sucursales");
  const rolNuevo = rol === "admin" ? "" : `&nuevoRol=${rol}`;
  redirect(`/admin/sucursales?nuevoEmail=${encodeURIComponent(email)}${rolNuevo}`);
}

export async function actualizarUsuario(id: string, formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const rol = String(formData.get("rol") ?? "mesero") as RolUsuario;
  const sucursalId = String(formData.get("sucursal_id") ?? "") || null;
  const claveNueva = String(formData.get("clave") ?? "");

  const cambios: {
    nombre: string;
    rol: RolUsuario;
    sucursal_id: string | null;
    activo: boolean;
    clave_cifrada?: string;
  } = {
    nombre: String(formData.get("nombre") ?? ""),
    rol,
    sucursal_id: rol === "admin" ? null : sucursalId,
    activo: formData.get("activo") === "on",
  };

  // Cambiar la contraseña: primero se confirma (por RLS) que el usuario es de este
  // negocio y luego se actualiza en Auth y en la copia cifrada.
  if (claveNueva) {
    const problema = validarClave(claveNueva);
    if (problema) redirect(`/admin/sucursales?errorClave=${encodeURIComponent(problema)}`);
    const { data: propio } = await supabase.from("usuarios").select("id").eq("id", id).maybeSingle();
    if (propio) {
      const { error } = await createAdminClient().auth.admin.updateUserById(id, { password: claveNueva });
      if (error) redirect(`/admin/sucursales?errorClave=${encodeURIComponent("No se pudo cambiar la contraseña.")}`);
      cambios.clave_cifrada = cifrarClave(claveNueva);
    }
  }

  await supabase.from("usuarios").update(cambios).eq("id", id);

  revalidatePath("/admin/sucursales");
}

/**
 * Muestra la contraseña de un usuario de ESTE negocio. Solo admin; se descifra
 * en el servidor y nunca viaja guardada en claro. Devuelve null si el usuario
 * no tiene una guardada (creado antes de esta función) o se cambió por fuera.
 */
export async function verClaveUsuario(id: string): Promise<{ ok: boolean; clave: string | null }> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("usuarios").select("clave_cifrada").eq("id", id).maybeSingle();
  if (!data) return { ok: false, clave: null };
  return { ok: true, clave: descifrarClave(data.clave_cifrada) };
}
