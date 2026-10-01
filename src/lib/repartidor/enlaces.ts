import { esPuntoValido } from "@/lib/location/geo";

/**
 * Enlaces profundos para el repartidor. Con pin del cliente se navega a las
 * coordenadas; sin pin se busca la referencia de la dirección como texto
 * (junto con la zona, para acotar la búsqueda).
 */

export interface DestinoEntrega {
  lat: number | null;
  lng: number | null;
  referencia: string;
  zona?: string | null;
}

const textoBusqueda = (d: DestinoEntrega) => [d.referencia, d.zona, "Honduras"].filter(Boolean).join(", ");

export function enlaceWaze(d: DestinoEntrega): string {
  if (esPuntoValido({ lat: d.lat, lng: d.lng })) {
    return `https://waze.com/ul?ll=${d.lat},${d.lng}&navigate=yes`;
  }
  return `https://waze.com/ul?q=${encodeURIComponent(textoBusqueda(d))}&navigate=yes`;
}

export function enlaceGoogleMaps(d: DestinoEntrega): string {
  const destino = esPuntoValido({ lat: d.lat, lng: d.lng }) ? `${d.lat},${d.lng}` : textoBusqueda(d);
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}&travelmode=driving`;
}

const digitos = (t: string) => t.replace(/\D/g, "");

export const enlaceLlamar = (telefono: string) => `tel:+504${digitos(telefono).slice(-8)}`;

export function enlaceWhatsapp(telefono: string, mensaje?: string): string {
  const base = `https://wa.me/504${digitos(telefono).slice(-8)}`;
  return mensaje ? `${base}?text=${encodeURIComponent(mensaje)}` : base;
}
