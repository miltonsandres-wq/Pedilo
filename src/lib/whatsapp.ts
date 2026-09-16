export const WHATSAPP_NUMERO = "50487972266";

export function linkWhatsapp(mensaje: string) {
  return `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensaje)}`;
}
