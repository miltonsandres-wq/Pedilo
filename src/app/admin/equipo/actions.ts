"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cifrarClave, descifrarClave, generarClaveTemporal, validarClave } from "@/lib/auth/clave";
import { mensajeErrorUsuario } from "@/lib/auth/errores";
import { esRolAsignable, esRolDePersonal } from "@/lib/auth/roles";

const RUTA = "/admin/equipo";
const irConError = (mensaje: string) => redirect(`${RUTA}?errorUsuario=${encodeURIComponent(mensaje)}`);
const irConErrorClave = (mensaje: string) => redirect(`${RUTA}?errorClave=${encodeURIComponent(mensaje)}`);

/**
 * Da de alta a alguien del equipo de trabajo (administrador, cajero, mesero o
 * cocina): crea su usuario de Supabase Auth con la contraseña que escribe el
 * admin (si la deja vacía se genera una) y su fila en `usuarios`
 * (negocio/rol/sucursal). La contraseña queda CIFRADA para que el admin pueda
 * volver a verla (ver verClaveUsuario). Cajero, mesero y cocina van amarrados a
 * una sucursal; el administrador no. Requiere la service_role key porque crear
 * usuarios de Auth no lo puede hacer un usuario común (se salta RLS a propósito).
 */
export async function crearUsuario(formData: FormData) {
  const sesion = await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const nombre = String(formData.get("nombre") ?? "");
  const rolForm = String(formData.get("rol") ?? "mesero");
  const sucursalId = String(formData.get("sucursal_id") ?? "") || null;
  const claveEscrita = String(formData.get("clave") ?? "");

  if (!esRolAsignable(rolForm)) irConError("Elige un rol válido.");
  const rol = rolForm as "admin" | "cajero" | "mesero" | "cocina";

  if (!email || !nombre.trim()) irConError("Escribe el nombre y el correo de la persona.");
  if (rol !== "admin" && !sucursalId) irConError("Cajero, mesero y cocina necesitan una sucursal asignada.");
  if (claveEscrita) {
    const problema = validarClave(claveEscrita);
    if (problema) irConErrorClave(problema);
  }

  const supabase = await createClient();

  // La sucursal tiene que ser de ESTE negocio
  if (rol !== "admin") {
    const { data: suc } = await supabase
      .from("sucursales")
      .select("id")
      .eq("id", sucursalId!)
      .eq("tenant_id", sesion.tenant_id)
      .maybeSingle();
    if (!suc) irConError("La sucursal elegida no existe.");
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

  const { error: errorPerfil } = await supabase.from("usuarios").insert({
    id: authUser.user.id,
    tenant_id: sesion.tenant_id,
    sucursal_id: rol === "admin" ? null : sucursalId,
    rol,
    nombre: nombre.trim(),
    clave_cifrada: cifrarClave(clave),
  });

  if (errorPerfil) {
    await admin.auth.admin.deleteUser(authUser.user.id);
    irConError("No se pudo guardar al usuario. Intenta de nuevo.");
  }

  revalidatePath(RUTA);
  const rolNuevo = rol === "admin" ? "" : `&nuevoRol=${rol}`;
  redirect(`${RUTA}?nuevoEmail=${encodeURIComponent(email)}${rolNuevo}`);
}

export async function actualizarUsuario(id: string, formData: FormData) {
  const sesion = await requireAdmin();
  const supabase = await createClient();
  const claveNueva = String(formData.get("clave") ?? "");

  // El usuario tiene que ser de este negocio (RLS) y de ahí sale su rol actual
  const { data: actual } = await supabase.from("usuarios").select("id, rol, sucursal_id").eq("id", id).maybeSingle();
  if (!actual) return;

  // Un administrador sigue siendo administrador y sin sucursal (así nunca te quedas sin admins);
  // al resto se le puede cambiar entre cajero, mesero y cocina.
  const rolForm = String(formData.get("rol") ?? "");
  const esAdmin = actual.rol === "admin";
  const rol = esAdmin ? "admin" : esRolDePersonal(rolForm) ? rolForm : actual.rol;
  const sucursalForm = String(formData.get("sucursal_id") ?? "") || null;

  let sucursalId = esAdmin ? null : (sucursalForm ?? actual.sucursal_id);
  if (sucursalId && !esAdmin) {
    const { data: suc } = await supabase
      .from("sucursales")
      .select("id")
      .eq("id", sucursalId)
      .eq("tenant_id", sesion.tenant_id)
      .maybeSingle();
    if (!suc) sucursalId = actual.sucursal_id;
  }

  const cambios: {
    nombre: string;
    rol: string;
    sucursal_id: string | null;
    activo: boolean;
    clave_cifrada?: string;
  } = {
    nombre: String(formData.get("nombre") ?? "").trim(),
    rol,
    sucursal_id: sucursalId,
    // Nadie se desactiva a sí mismo (se quedaría sin acceso al panel)
    activo: id === sesion.id ? true : formData.get("activo") === "on",
  };
  if (!cambios.nombre) irConError("El nombre no puede quedar vacío.");

  // Cambiar la contraseña: en Auth y en la copia cifrada
  if (claveNueva) {
    const problema = validarClave(claveNueva);
    if (problema) irConErrorClave(problema);
    const { error } = await createAdminClient().auth.admin.updateUserById(id, { password: claveNueva });
    if (error) irConErrorClave("No se pudo cambiar la contraseña.");
    cambios.clave_cifrada = cifrarClave(claveNueva);
  }

  await supabase.from("usuarios").update(cambios).eq("id", id);
  revalidatePath(RUTA);
}

/**
 * Muestra la contraseña de alguien de ESTE negocio. Solo admin; se descifra en
 * el servidor y nunca viaja guardada en claro. Devuelve null si no tiene una
 * guardada (creado antes de esta función) o se cambió por fuera.
 */
export async function verClaveUsuario(id: string): Promise<{ ok: boolean; clave: string | null }> {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("usuarios").select("clave_cifrada").eq("id", id).maybeSingle();
  if (!data) return { ok: false, clave: null };
  return { ok: true, clave: descifrarClave(data.clave_cifrada) };
}
