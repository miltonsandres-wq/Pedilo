"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { firmarJwtRepartidor } from "@/lib/repartidor/jwt";
import { slugValido } from "@/lib/delivery/rutas";

/**
 * Entrada del repartidor: restaurante (código/slug) + su nombre + PIN. No tiene
 * cuenta de Supabase Auth: si el PIN es correcto se le firma un JWT propio (ver
 * lib/repartidor/jwt.ts) que sirve de sesión del turno. La RLS hace que con ese
 * token solo vea y toque SUS pedidos asignados.
 */

async function ip() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "desconocida").trim();
}

export interface RestauranteRep {
  sucursalId: string;
  nombre: string;
  repartidores: { id: string; nombre: string }[];
}

/** Resuelve el código del restaurante y lista sus repartidores activos (solo nombres). */
export async function resolverRestaurante(slug: string): Promise<{ ok: true; restaurante: RestauranteRep } | { ok: false; error: string }> {
  const codigo = slug.trim().toLowerCase();
  if (!slugValido(codigo)) return { ok: false, error: "Código de restaurante no válido." };
  const admin = createAdminClient();

  const { data: permitido } = await admin.rpc("delivery_rate_limit_hit", { p_clave: `repbusca:${await ip()}`, p_max: 40, p_ventana_seg: 600 });
  if (permitido === false) return { ok: false, error: "Demasiados intentos. Espera unos minutos." };

  const { data: config } = await admin.from("delivery_config").select("sucursal_id").eq("slug", codigo).maybeSingle();
  if (!config) return { ok: false, error: "No encontramos ese restaurante." };
  const [{ data: sucursal }, { data: reps }] = await Promise.all([
    admin.from("sucursales").select("nombre").eq("id", config.sucursal_id).single(),
    admin.from("repartidores").select("id, nombre").eq("sucursal_id", config.sucursal_id).eq("activo", true).order("nombre"),
  ]);
  if (!sucursal) return { ok: false, error: "No encontramos ese restaurante." };
  return { ok: true, restaurante: { sucursalId: config.sucursal_id, nombre: sucursal.nombre, repartidores: reps ?? [] } };
}

export interface SesionEmitida {
  token: string;
  exp: number;
  repartidorId: string;
  tenantId: string;
  sucursalId: string;
  nombre: string;
  restaurante: string;
  radioLlegadaM: number;
  velocidadKmh: number;
}

export async function iniciarSesionRepartidor(params: {
  slug: string;
  repartidorId: string;
  pin: string;
}): Promise<{ ok: true; sesion: SesionEmitida } | { ok: false; error: string }> {
  const slug = params.slug.trim().toLowerCase();
  if (!slugValido(slug) || !/^\d{4,6}$/.test(params.pin)) return { ok: false, error: "Revisa tu PIN (4 a 6 dígitos)." };

  const admin = createAdminClient();
  const { data: permitido } = await admin.rpc("delivery_rate_limit_hit", { p_clave: `replogin:${await ip()}`, p_max: 30, p_ventana_seg: 600 });
  if (permitido === false) return { ok: false, error: "Demasiados intentos desde este teléfono. Espera unos minutos." };

  const { data: config } = await admin
    .from("delivery_config")
    .select("sucursal_id, radio_llegada_m, velocidad_moto_kmh")
    .eq("slug", slug)
    .maybeSingle();
  if (!config) return { ok: false, error: "No encontramos ese restaurante." };

  // El repartidor tiene que ser de ESE restaurante
  const { data: rep } = await admin.from("repartidores").select("id, sucursal_id").eq("id", params.repartidorId).maybeSingle();
  if (!rep || rep.sucursal_id !== config.sucursal_id) return { ok: false, error: "PIN incorrecto." };

  const { data, error } = await admin.rpc("repartidor_login", { p_repartidor: params.repartidorId, p_pin: params.pin });
  if (error) return { ok: false, error: "No pudimos verificar tu PIN. Intenta de nuevo." };
  const r = data as { ok: boolean; motivo?: string; tenant_id?: string; sucursal_id?: string; nombre?: string };
  if (!r.ok) {
    if (r.motivo === "bloqueado") return { ok: false, error: "Demasiados intentos fallidos. Tu acceso está bloqueado por 15 minutos." };
    return { ok: false, error: "PIN incorrecto." };
  }

  const secreto = process.env.SUPABASE_JWT_SECRET;
  if (!secreto) {
    console.error("[repartidor] Falta SUPABASE_JWT_SECRET: no se puede iniciar sesión de repartidores");
    return { ok: false, error: "El servidor no está configurado para repartidores. Avisa al administrador." };
  }

  const [{ data: sucursal }] = await Promise.all([admin.from("sucursales").select("nombre").eq("id", config.sucursal_id).single()]);
  const { token, exp } = firmarJwtRepartidor(
    { repartidorId: params.repartidorId, tenantId: r.tenant_id!, sucursalId: config.sucursal_id },
    secreto
  );
  return {
    ok: true,
    sesion: {
      token, exp, repartidorId: params.repartidorId, tenantId: r.tenant_id!, sucursalId: config.sucursal_id,
      nombre: r.nombre ?? "", restaurante: sucursal?.nombre ?? "", radioLlegadaM: config.radio_llegada_m,
      velocidadKmh: Number(config.velocidad_moto_kmh),
    },
  };
}
