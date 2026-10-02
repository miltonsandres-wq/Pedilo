import type { ModoImpresion } from "./transportes";
import { ANCHO_58MM, ANCHO_80MM } from "./documentoTexto";

/** Preferencias de impresión de ESTE dispositivo (cada caja/teléfono tiene la suya). */
const CLAVE_MODO = "pedilo:impresion:modo";
const CLAVE_ANCHO = "pedilo:impresion:ancho";

const MODOS: ModoImpresion[] = ["navegador", "bluetooth", "usb", "rawbt"];

export function leerModoPreferido(): ModoImpresion | null {
  try {
    const v = window.localStorage.getItem(CLAVE_MODO) as ModoImpresion | null;
    return v && MODOS.includes(v) ? v : null;
  } catch {
    return null;
  }
}

export function guardarModoPreferido(modo: ModoImpresion) {
  try {
    window.localStorage.setItem(CLAVE_MODO, modo);
  } catch {
    /* sin almacenamiento: vale para esta sesión */
  }
}

/** Ancho del papel en caracteres: 48 (80 mm) por omisión, 32 si es de 58 mm. */
export function leerAnchoPapel(): number {
  try {
    return Number(window.localStorage.getItem(CLAVE_ANCHO)) === ANCHO_58MM ? ANCHO_58MM : ANCHO_80MM;
  } catch {
    return ANCHO_80MM;
  }
}

export function guardarAnchoPapel(columnas: number) {
  try {
    window.localStorage.setItem(CLAVE_ANCHO, String(columnas === ANCHO_58MM ? ANCHO_58MM : ANCHO_80MM));
  } catch {
    /* ver arriba */
  }
}
