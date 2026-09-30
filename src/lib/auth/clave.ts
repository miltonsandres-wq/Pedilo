import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Contraseñas que el admin puede volver a ver (cajeros/meseros). No se guardan
 * en texto plano: se cifran con AES-256-GCM usando una llave que vive solo en
 * el servidor (CLAVE_CIFRADO, o la service_role key si no se define), y solo se
 * descifran cuando un admin del mismo negocio pulsa «Ver contraseña».
 * Solo para usar en el servidor.
 */

const PREFIJO = "v1.";
export const LARGO_MINIMO_CLAVE = 6; // mínimo de Supabase Auth

function llave(secreto?: string): Buffer {
  const base = secreto ?? process.env.CLAVE_CIFRADO ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error("Falta CLAVE_CIFRADO o SUPABASE_SERVICE_ROLE_KEY para cifrar contraseñas.");
  return createHash("sha256").update(`pedilo-clave-v1:${base}`).digest();
}

export function cifrarClave(clave: string, secreto?: string): string {
  const iv = randomBytes(12);
  const cifrador = createCipheriv("aes-256-gcm", llave(secreto), iv);
  const cifrado = Buffer.concat([cifrador.update(clave, "utf8"), cifrador.final()]);
  return PREFIJO + Buffer.concat([iv, cifrador.getAuthTag(), cifrado]).toString("base64url");
}

/** Devuelve la contraseña, o null si el dato no es válido / fue alterado / la llave cambió. */
export function descifrarClave(token: string | null | undefined, secreto?: string): string | null {
  if (!token?.startsWith(PREFIJO)) return null;
  try {
    const datos = Buffer.from(token.slice(PREFIJO.length), "base64url");
    if (datos.length < 12 + 16 + 1) return null;
    const descifrador = createDecipheriv("aes-256-gcm", llave(secreto), datos.subarray(0, 12));
    descifrador.setAuthTag(datos.subarray(12, 28));
    return Buffer.concat([descifrador.update(datos.subarray(28)), descifrador.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Contraseña temporal legible (sin símbolos ambiguos) para cuando el admin no escribe una. */
export function generarClaveTemporal(): string {
  const alfabeto = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
}

/** Valida la contraseña que escribe el admin. Devuelve el mensaje de error, o null si está bien. */
export function validarClave(clave: string): string | null {
  if (clave.length < LARGO_MINIMO_CLAVE) return `La contraseña debe tener al menos ${LARGO_MINIMO_CLAVE} caracteres.`;
  if (clave.length > 72) return "La contraseña no puede pasar de 72 caracteres.";
  return null;
}
