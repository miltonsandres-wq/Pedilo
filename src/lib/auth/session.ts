import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/types/helpers";

export type SesionUsuario = Tables<"usuarios"> & { email: string | null };

/**
 * Trae el usuario autenticado + su fila de negocio en `usuarios`
 * (tenant_id, rol, sucursal_id). Es la única fuente de verdad para saber
 * qué puede ver/hacer cada quien en la UI; RLS hace cumplir lo mismo en la
 * base por si algo se saltara este chequeo.
 */
export async function getSesion(): Promise<SesionUsuario | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: usuario } = await supabase
    .from("usuarios")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!usuario) return null;

  return { ...usuario, email: user.email ?? null };
}

/**
 * true si hay sesión de Supabase Auth pero todavía no existe la fila en
 * `usuarios` — el caso típico de alguien que entró con Google por primera
 * vez y no ha terminado de dar de alta sus sucursales (ver
 * /auth/callback y /registro/completar).
 */
export async function tieneCuentaSinCompletar(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: usuario } = await supabase
    .from("usuarios")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  return !usuario;
}

/** Exige sesión completa; si no hay cuenta, manda a /login, y si le falta terminar el registro (Google), a /registro/completar. */
export async function requireSesion(): Promise<SesionUsuario> {
  const sesion = await getSesion();
  if (sesion) return sesion;
  if (await tieneCuentaSinCompletar()) redirect("/registro/completar");
  redirect("/login");
}

/**
 * true si el tenant no debe poder operar: se le venció la prueba de 15 días
 * sin pasar a un plan pagado, se le venció el mes ya pagado, o vos lo
 * suspendiste a mano desde /plataforma. Usa la service_role key porque esto
 * se evalúa antes de saber si el usuario tiene por qué poder leer `tenants`.
 */
async function bloqueadoPorSuscripcion(tenantId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from("tenants")
    .select("suscripcion_estado, prueba_vence_el, suscripcion_vence_el")
    .eq("id", tenantId)
    .single();

  if (!tenant) return false;
  if (tenant.suscripcion_estado === "suspendida") return true;
  if (tenant.suscripcion_estado === "prueba") {
    return !!tenant.prueba_vence_el && new Date(tenant.prueba_vence_el) < new Date();
  }
  if (tenant.suscripcion_estado === "activa") {
    return !!tenant.suscripcion_vence_el && new Date(tenant.suscripcion_vence_el) < new Date();
  }
  return false;
}

/** Exige sesión con rol admin y suscripción al día; si no, manda al POS o a /suspendida. */
export async function requireAdmin(): Promise<SesionUsuario> {
  const sesion = await requireSesion();
  if (sesion.rol !== "admin") redirect("/pos");
  if (await bloqueadoPorSuscripcion(sesion.tenant_id)) redirect("/suspendida");
  return sesion;
}

/** Exige sesión operativa (cajero/mesero/admin) con suscripción al día y una sucursal resuelta. */
export async function requireSucursal(): Promise<
  SesionUsuario & { sucursal_id: string }
> {
  const sesion = await requireSesion();
  if (await bloqueadoPorSuscripcion(sesion.tenant_id)) redirect("/suspendida");
  // El admin no tiene sucursal fija: si entra al POS, opera la primera activa
  // de su tenant (puede cambiarla desde el selector del layout del POS).
  if (sesion.sucursal_id) {
    return sesion as SesionUsuario & { sucursal_id: string };
  }
  redirect("/admin");
}

/**
 * Exige sesión de cualquier rol operativo (admin/cajero/mesero) con
 * suscripción al día. A diferencia de requireSucursal(), NO exige una
 * sucursal fija — la usan pantallas como /cocina que el admin también
 * necesita poder abrir, y que resuelven la sucursal ellas mismas (fija
 * para cajero/mesero, elegible por query param para el admin).
 */
export async function requireOperativo(): Promise<SesionUsuario> {
  const sesion = await requireSesion();
  if (await bloqueadoPorSuscripcion(sesion.tenant_id)) redirect("/suspendida");
  return sesion;
}

/**
 * Exige sesión y que el usuario esté en `plataforma_admins` (sos vos, el
 * dueño de Pedilo). Deliberadamente NO pasa por bloqueadoPorSuscripcion: tu
 * acceso al panel de plataforma nunca depende del estado de tu propio tenant.
 */
export async function requireSuperAdmin(): Promise<SesionUsuario> {
  const sesion = await requireSesion();
  const admin = createAdminClient();
  const { data } = await admin
    .from("plataforma_admins")
    .select("user_id")
    .eq("user_id", sesion.id)
    .maybeSingle();
  if (!data) redirect("/");
  return sesion;
}
