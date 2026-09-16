"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { crearTenantConSucursales, type SucursalRegistro } from "./crear-tenant";

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
  const email = payload.email.trim().toLowerCase();
  const password = payload.password;

  if (!nombreAdmin || !email || !password) {
    return { error: "Faltan datos obligatorios." };
  }
  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }

  const resultado = await crearTenantConSucursales(payload.sucursales);
  if ("error" in resultado) return resultado;
  const { tenantId } = resultado;

  const admin = createAdminClient();

  const { data: authUser, error: errAuth } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (errAuth || !authUser.user) {
    await admin.from("tenants").delete().eq("id", tenantId);
    const yaExiste = errAuth?.message?.toLowerCase().includes("already registered");
    return { error: yaExiste ? "Ya existe una cuenta con ese correo." : "No se pudo crear la cuenta. Intenta de nuevo." };
  }

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
