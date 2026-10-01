import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * JWT propio del repartidor (HS256, firmado con el secreto JWT del proyecto de
 * Supabase). PostgREST/Realtime lo aceptan como a cualquier sesión: rol
 * `authenticated` + el claim `repartidor_id` que leen las políticas de RLS
 * (current_repartidor_id(), migración 0023). El `sub` NO existe en `usuarios`,
 * así que no recibe ningún permiso de personal.
 *
 * Solo corre en el servidor (usa node:crypto y el secreto).
 */

export interface ClaimsRepartidor {
  repartidorId: string;
  tenantId: string;
  sucursalId: string;
}

/** El turno dura como máximo esto; al liquidar se pide entrar de nuevo. */
export const DURACION_TURNO_S = 16 * 3600;

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function firmarJwtRepartidor(claims: ClaimsRepartidor, secreto: string, ahoraS = Math.floor(Date.now() / 1000)): { token: string; exp: number } {
  if (!secreto) throw new Error("Falta SUPABASE_JWT_SECRET");
  const exp = ahoraS + DURACION_TURNO_S;
  const cuerpo = {
    aud: "authenticated",
    role: "authenticated",
    sub: claims.repartidorId,
    repartidor_id: claims.repartidorId,
    tenant_id: claims.tenantId,
    sucursal_id: claims.sucursalId,
    iat: ahoraS,
    exp,
  };
  const firmado = `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify(cuerpo))}`;
  const firma = createHmac("sha256", secreto).update(firmado).digest("base64url");
  return { token: `${firmado}.${firma}`, exp };
}

/** Verifica firma y expiración (para pruebas y para validar una sesión guardada). */
export function verificarJwtRepartidor(token: string, secreto: string, ahoraS = Math.floor(Date.now() / 1000)): Record<string, unknown> | null {
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  const esperada = createHmac("sha256", secreto).update(`${partes[0]}.${partes[1]}`).digest();
  const recibida = Buffer.from(partes[2], "base64url");
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  try {
    const cuerpo = JSON.parse(Buffer.from(partes[1], "base64url").toString()) as Record<string, unknown>;
    return typeof cuerpo.exp === "number" && cuerpo.exp > ahoraS ? cuerpo : null;
  } catch {
    return null;
  }
}
