import "server-only";
import { headers } from "next/headers";

/** Origen público de la app (usa el host real de la petición: funciona igual
 * en localhost, en preview y detrás de Cloudflare/Coolify en producción). */
export async function obtenerOrigen() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
