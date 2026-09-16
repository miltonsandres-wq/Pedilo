"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { crearTenantConSucursales, type SucursalRegistro } from "../crear-tenant";

export type CompletarRegistroPayload = {
  nombreAdmin: string;
  sucursales: SucursalRegistro[];
};

/**
 * Termina el alta de alguien que entró con Google por primera vez: ya tiene
 * cuenta de Supabase Auth (creada por el propio OAuth), solo le falta el
 * tenant + sucursales + su fila en `usuarios`. Es el equivalente de
 * registrarNegocio() pero sin crear usuario de Auth ni pedir contraseña.
 */
export async function completarRegistroGoogle(
  _prevState: unknown,
  payload: CompletarRegistroPayload
): Promise<{ error: string } | undefined> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Ya se completó en otra pestaña/intento — no crear un tenant duplicado.
  const { data: existente } = await supabase.from("usuarios").select("id").eq("id", user.id).maybeSingle();
  if (existente) redirect("/");

  const nombreAdmin = payload.nombreAdmin.trim();
  if (!nombreAdmin) return { error: "Escribe tu nombre." };

  const resultado = await crearTenantConSucursales(payload.sucursales);
  if ("error" in resultado) return resultado;

  // La policy de INSERT de `usuarios` exige is_admin(), que a su vez lee la
  // fila que estamos a punto de crear — mismo problema del huevo y la
  // gallina que en registrarNegocio(). Se resuelve igual: service_role.
  const admin = createAdminClient();
  const { error: errPerfil } = await admin.from("usuarios").insert({
    id: user.id,
    tenant_id: resultado.tenantId,
    sucursal_id: null,
    rol: "admin",
    nombre: nombreAdmin,
  });
  if (errPerfil) {
    return { error: "No se pudo completar el registro. Intenta de nuevo." };
  }

  redirect("/admin");
}
