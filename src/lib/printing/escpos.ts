import type { Instruccion } from "./types";

/**
 * Convierte las instrucciones de un ticket (las mismas que recibe el agente de
 * impresión) en bytes ESC/POS, para mandarlos DIRECTO a una impresora térmica
 * desde el navegador (Bluetooth, USB o la app RawBT) sin agente ni drivers.
 * Función pura: no toca ninguna API del navegador.
 */

// Página de códigos CP858 (latín con euro): la que traen casi todas las térmicas
// con ESC t 19. Cubre el español completo (acentos, ñ, ¿, ¡).
const CP858: Record<string, number> = {
  Ç: 0x80, ü: 0x81, é: 0x82, â: 0x83, ä: 0x84, à: 0x85, å: 0x86, ç: 0x87, ê: 0x88, ë: 0x89, è: 0x8a, ï: 0x8b, î: 0x8c,
  ì: 0x8d, Ä: 0x8e, Å: 0x8f, É: 0x90, æ: 0x91, Æ: 0x92, ô: 0x93, ö: 0x94, ò: 0x95, û: 0x96, ù: 0x97, ÿ: 0x98, Ö: 0x99,
  Ü: 0x9a, ø: 0x9b, "£": 0x9c, Ø: 0x9d, "×": 0x9e, á: 0xa0, í: 0xa1, ó: 0xa2, ú: 0xa3, ñ: 0xa4, Ñ: 0xa5, ª: 0xa6, º: 0xa7,
  "¿": 0xa8, "®": 0xa9, "¬": 0xaa, "½": 0xab, "¼": 0xac, "¡": 0xad, "«": 0xae, "»": 0xaf, Á: 0xb5, Â: 0xb6, À: 0xb7,
  "©": 0xb8, Ê: 0xd2, Ë: 0xd3, È: 0xd4, "€": 0xd5, Í: 0xd6, Î: 0xd7, Ï: 0xd8, Ó: 0xe0, Ô: 0xe2, Ò: 0xe3, Õ: 0xe5, Ú: 0xe9,
  Û: 0xea, Ù: 0xeb,
};

/** Texto → bytes CP858. Lo que no existe en la página se cambia por "?". */
export function codificarCp858(texto: string): number[] {
  const out: number[] = [];
  for (const ch of texto) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x20 && c < 0x7f) out.push(c);
    else if (CP858[ch] !== undefined) out.push(CP858[ch]);
    else if (ch === "\t") out.push(0x20);
    else out.push(0x3f);
  }
  return out;
}

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export interface OpcionesEscPos {
  /** Caracteres por línea (48 = 80 mm, 32 = 58 mm); define el largo de las rayas. */
  columnas?: number;
  /** Cortar el papel al final (las portátiles sin cortador lo ignoran). */
  cortar?: boolean;
}

export function aEscPos(instrucciones: Instruccion[], opciones: OpcionesEscPos = {}): Uint8Array<ArrayBuffer> {
  const columnas = opciones.columnas ?? 48;
  const b: number[] = [];
  b.push(ESC, 0x40); // inicializar
  b.push(ESC, 0x74, 19); // CP858

  for (const ins of instrucciones) {
    switch (ins.op) {
      case "texto": {
        b.push(ESC, 0x61, ins.align === "center" ? 1 : ins.align === "right" ? 2 : 0);
        b.push(ESC, 0x45, ins.bold ? 1 : 0);
        b.push(GS, 0x21, ins.size === "doble" ? 0x11 : 0x00);
        b.push(...codificarCp858(ins.texto), LF);
        break;
      }
      case "linea":
        b.push(ESC, 0x61, 0, ESC, 0x45, 0, GS, 0x21, 0);
        b.push(...codificarCp858("-".repeat(columnas)), LF);
        break;
      case "salto":
        for (let i = 0; i < (ins.n ?? 1); i++) b.push(LF);
        break;
      case "cortar":
        if (opciones.cortar !== false) b.push(GS, 0x56, 0x42, 0x00); // avanzar y corte parcial
        break;
      case "logo":
        break; // el logo en raster solo lo manda el agente; directo se omite
    }
  }
  // dejar la impresora en estado normal
  b.push(ESC, 0x61, 0, ESC, 0x45, 0, GS, 0x21, 0);
  return Uint8Array.from(b);
}

/** Base64 de los bytes (para el enlace de la app RawBT). */
export function bytesABase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
