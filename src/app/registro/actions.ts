"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { crearTenantConSucursales, type SucursalRegistro } from "./crear-tenant";
import { mensajeErrorAuth, normalizarCorreo, validarCuenta, validarSucursales } from "@/lib/registro/validaciones";

export type { SucursalRegistro };

export type RegistroPayload = {
  nombreAdmin: string;
  email: string;
  password: string;
  sucursales: SucursalRegistro[];
};

/**
 * Alta de un tenant nuevo desde el registro público con correo/contraseña
 * (self-service SaaS). No hay concepto de "negocio" en la UI: el admin da de
 * alta directamente sus sucursales (ver crearTenantConSucursales). Todo se
 * hace con la service_role key porque ninguna de las tablas tiene policy de
 * INSERT para un usuario que todavía no existe en `usuarios` (ver
 * 0002_rls.sql). Si cualquier paso falla se revierte lo ya creado.
 */
export async function registrarNegocio(
  _prevState: unknown,
  payload: RegistroPayload
): Promise<{ error: string } | undefined> {
  const nombreAdmin = payload.nombreAdmin.trim();
  const email = normalizarCorreo(payload.email);
  const password = payload.password;

  // El servidor valida lo mismo que el formulario: nunca confía en el navegador
  const errCuenta = validarCuenta({ nombreAdmin, email, password, confirmarPassword: password });
  const primero = Object.values(errCuenta)[0];
  if (primero) return { error: primero };
  const errSucursales = validarSucursales(payload.sucursales);
  const primeraSucursal = errSucursales.general ?? errSucursales.porSucursal.flatMap((e) => Object.values(e))[0];
  if (primeraSucursal) return { error: primeraSucursal };

  const admin = createAdminClient();

  // Primero el usuario: si el correo ya existe o la contraseña no sirve, se avisa de inmediato
  // y no se crea nada a medias (antes se creaba el negocio y luego se descubría el problema).
  const { data: authUser, error: errAuth } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (errAuth || !authUser.user) return { error: mensajeErrorAuth(errAuth) };

  const resultado = await crearTenantConSucursales(payload.sucursales);
  if ("error" in resultado) {
    await admin.auth.admin.deleteUser(authUser.user.id);
    return resultado;
  }
  const { tenantId } = resultado;

  const { error: errPerfil } = await admin.from("usuarios").insert({
    id: authUser.user.id,
    tenant_id: tenantId,
    sucursal_id: null,
    rol: "admin",
    nombre: nombreAdmin,
  });
  if (errPerfil) {
    await admin.auth.admin.deleteUser(authUser.user.id);
    await admin.from("tenants").delete().eq("id", tenantId);
    return { error: "No se pudo completar el registro. Intenta de nuevo." };
  }

  const supabase = await createClient();
  const { error: errSignIn } = await supabase.auth.signInWithPassword({ email, password });
  if (errSignIn) {
    redirect("/login");
  }

  redirect("/admin");
}
