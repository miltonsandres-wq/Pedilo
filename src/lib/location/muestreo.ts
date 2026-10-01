import { distanciaM, dentroDeRadio, type Punto } from "./geo";
import type { Lectura } from "./tipos";

/**
 * Reglas puras de muestreo del GPS (sin APIs del navegador, fáciles de probar).
 *  - throttling de la posición en vivo: cada 10–15 s o al moverse ~50 m;
 *  - descartar lecturas con precisión peor a ~100 m;
 *  - muestreo del rastro que SÍ se guarda: ~1 punto por minuto;
 *  - llegada automática por geocerca alrededor del pin del cliente.
 */

export interface OpcionesThrottle {
  intervaloMs: number;
  distanciaM: number;
  precisionMaxM: number;
}

export const THROTTLE_POR_DEFECTO: OpcionesThrottle = { intervaloMs: 12_000, distanciaM: 50, precisionMaxM: 100 };

export type DecisionLectura = "publicar" | "omitir" | "descartar_precision";

/** Decide qué lecturas se publican en vivo: lo que ocurra primero entre tiempo y distancia. */
export function crearThrottle(opciones: OpcionesThrottle = THROTTLE_POR_DEFECTO) {
  let ultima: Lectura | null = null;
  return {
    evaluar(l: Lectura): DecisionLectura {
      if (l.precisionM != null && l.precisionM > opciones.precisionMaxM) return "descartar_precision";
      if (
        !ultima ||
        l.t - ultima.t >= opciones.intervaloMs ||
        distanciaM(ultima, l) >= opciones.distanciaM
      ) {
        ultima = l;
        return "publicar";
      }
      return "omitir";
    },
    /** La próxima lectura válida se publica sin esperar (ej. al volver la app al frente). */
    reiniciar() {
      ultima = null;
    },
  };
}

export const MUESTREO_RASTRO_MS = 60_000;

/** ~1 punto por minuto para guardar en la base (no cada lectura). */
export function crearMuestreoRastro(cadaMs = MUESTREO_RASTRO_MS) {
  let ultimo = -Infinity;
  return {
    /** true si ya toca guardar un punto con esta lectura. */
    tocaMuestrear(t: number): boolean {
      if (t - ultimo >= cadaMs) {
        ultimo = t;
        return true;
      }
      return false;
    },
    reiniciar() {
      ultimo = -Infinity;
    },
  };
}

export const RADIO_LLEGADA_POR_DEFECTO_M = 100;

/**
 * Llegada automática: se considera que llegó cuando varias lecturas SEGUIDAS caen
 * dentro del radio del pin (una sola puede ser un salto del GPS). Avisa una vez.
 */
export function crearDetectorLlegada(radioM = RADIO_LLEGADA_POR_DEFECTO_M, lecturasSeguidas = 2) {
  let seguidas = 0;
  let avisado = false;
  return {
    /** true UNA sola vez, en la lectura que confirma la llegada. */
    actualizar(pos: Lectura, destino: Punto | null): boolean {
      if (avisado || !destino) return false;
      const fiable = pos.precisionM == null || pos.precisionM <= radioM;
      if (fiable && dentroDeRadio(pos, destino, radioM)) seguidas += 1;
      else seguidas = 0;
      if (seguidas >= lecturasSeguidas) {
        avisado = true;
        return true;
      }
      return false;
    },
    reiniciar() {
      seguidas = 0;
      avisado = false;
    },
  };
}
