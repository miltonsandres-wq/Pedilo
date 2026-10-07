/** Mensaje llamativo del flyer del QR. El dueño lo edita por sucursal; si no, se usa el de por defecto. */

export const MAX_MENSAJE_FLYER = 80;
export const MENSAJE_FLYER_POR_DEFECTO = "¡Pide desde tu mesa, sin esperar!";

export const SUGERENCIAS_FLYER = [
  "¡Pide desde tu mesa, sin esperar!",
  "¡Escanea, elige y disfruta!",
  "Tu menú está a un escaneo de distancia",
  "¿Hambre? Escanea y pide ya",
  "Mira el menú y ordena desde tu celular",
];

/** Lo que se imprime: el mensaje de la sucursal o, si está vacío, el de por defecto. */
export function mensajeParaFlyer(guardado: string | null | undefined): string {
  const m = (guardado ?? "").replace(/\s+/g, " ").trim();
  return m || MENSAJE_FLYER_POR_DEFECTO;
}

/** Limpia lo que escribe el dueño: espacios de más fuera y tope de largo. Vacío = volver al mensaje por defecto. */
export function normalizarMensajeFlyer(texto: string): { ok: true; mensaje: string | null } | { ok: false; error: string } {
  const m = texto.replace(/\s+/g, " ").trim();
  if (m.length > MAX_MENSAJE_FLYER) return { ok: false, error: `El mensaje es muy largo (máximo ${MAX_MENSAJE_FLYER} caracteres).` };
  return { ok: true, mensaje: m || null };
}
