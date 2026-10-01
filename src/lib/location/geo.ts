/**
 * Geometría para el delivery: distancias, ETA y geocerca. Funciones puras (sin
 * red ni APIs del navegador) para poder probarlas y compartirlas entre la PWA
 * del repartidor, el seguimiento del cliente y el mapa de flota.
 */

export interface Punto {
  lat: number;
  lng: number;
}

const RADIO_TIERRA_M = 6_371_000;
const aRad = (g: number) => (g * Math.PI) / 180;

/** Distancia en línea recta (haversine), en metros. */
export function distanciaM(a: Punto, b: Punto): number {
  const dLat = aRad(b.lat - a.lat);
  const dLng = aRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aRad(a.lat)) * Math.cos(aRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** ¿`punto` está dentro de `radioM` metros de `centro`? */
export const dentroDeRadio = (punto: Punto, centro: Punto, radioM: number) => distanciaM(punto, centro) <= radioM;

/** Velocidad promedio de moto por omisión (km/h). Configurable por sucursal. */
export const VELOCIDAD_MOTO_KMH = 25;

/** ETA simple: distancia en línea recta ÷ velocidad promedio. Mínimo 1 minuto. */
export function etaMinutos(distanciaMetros: number, velocidadKmh = VELOCIDAD_MOTO_KMH): number {
  const v = velocidadKmh > 0 ? velocidadKmh : VELOCIDAD_MOTO_KMH;
  return Math.max(1, Math.ceil(distanciaMetros / ((v * 1000) / 60)));
}

export function textoDistancia(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

export const esPuntoValido = (p: { lat?: number | null; lng?: number | null } | null | undefined): p is Punto =>
  !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat!) <= 90 && Math.abs(p.lng!) <= 180;
