/**
 * El menú público de delivery vive en la raíz: /[slug] y /[slug]/pedido/[token].
 * Para no pisar rutas de la app, esos nombres NO se pueden usar como slug. Esta
 * lista tiene que coincidir con el CHECK de delivery_config.slug (migración
 * 0022); hay una prueba que lo verifica.
 */
export const SLUGS_RESERVADOS = [
  "admin", "pos", "cocina", "login", "registro", "auth", "api", "carta", "repartidor", "plataforma",
  "privacidad", "terminos", "suspendida", "configuracion-inicial", "manifest", "sw", "icons", "static",
] as const;

export const FORMATO_SLUG = /^[a-z0-9][a-z0-9-]{2,39}$/;

export function slugValido(slug: string): boolean {
  return FORMATO_SLUG.test(slug) && !(SLUGS_RESERVADOS as readonly string[]).includes(slug);
}

/** Convierte un nombre ("Fondita Doña Ana") en un slug sugerido ("fondita-dona-ana"). */
export function slugDesdeNombre(nombre: string): string {
  const s = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return s.length >= 3 ? s : `${s}-pedidos`.replace(/^-/, "");
}

/**
 * ¿Es una página pública de delivery? (sin sesión de Supabase)
 *   /fondita                      -> menú
 *   /fondita/pedido/<token>       -> seguimiento
 *   /fondita/pedido/<token>/factura -> factura en PDF (solo con el token)
 */
export function esRutaPublicaDelivery(pathname: string): boolean {
  const partes = pathname.split("/").filter(Boolean);
  if (partes.length === 0) return false;
  if (!slugValido(partes[0])) return false;
  if (partes.length === 1) return true;
  if (partes[1] !== "pedido" || partes.length < 3 || partes.length > 4) return false;
  return partes.length === 3 || partes[3] === "factura";
}
