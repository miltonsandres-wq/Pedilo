/**
 * Formato y validaciones fiscales (SAR Honduras). Funciones puras, sin red ni
 * base de datos: las usan tanto la UI de admin como la emisión offline.
 */

/** CAI: 32 hex en 6 grupos XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XX (37 con guiones). */
export const CAI_REGEX = /^[0-9A-F]{6}(-[0-9A-F]{6}){4}-[0-9A-F]{2}$/;

export function normalizarCai(valor: string): string {
  return valor.trim().toUpperCase();
}

export function esCaiValido(valor: string): boolean {
  return CAI_REGEX.test(normalizarCai(valor));
}

/** Deja solo dígitos: el RTN suele escribirse como 0801-1999-123456. */
export function normalizarRtn(valor: string): string {
  return valor.replace(/\D/g, "");
}

export function esRtnValido(valor: string): boolean {
  return /^\d{14}$/.test(normalizarRtn(valor));
}

const soloDigitos = (valor: string, largo: number) => new RegExp(`^\\d{${largo}}$`).test(valor);

export interface PartesNumeroDocumento {
  establecimiento: string; // EEE
  puntoEmision: string; // PPP
  tipoDoc: string; // TT
  correlativo: number; // CCCCCCCC
}

/** EEE-PPP-TT-CCCCCCCC (16 dígitos con guiones: 19 caracteres). */
export function formatearNumeroDocumento(p: PartesNumeroDocumento): string {
  if (!soloDigitos(p.establecimiento, 3)) throw new Error("El establecimiento debe tener 3 dígitos");
  if (!soloDigitos(p.puntoEmision, 3)) throw new Error("El punto de emisión debe tener 3 dígitos");
  if (!soloDigitos(p.tipoDoc, 2)) throw new Error("El tipo de documento debe tener 2 dígitos");
  if (!Number.isInteger(p.correlativo) || p.correlativo < 1 || p.correlativo > 99_999_999) {
    throw new Error("El correlativo debe ser un entero entre 1 y 99999999");
  }
  return `${p.establecimiento}-${p.puntoEmision}-${p.tipoDoc}-${String(p.correlativo).padStart(8, "0")}`;
}

/** Rellena con ceros a la izquierda (ej. "1" -> "001"). */
export function rellenarCeros(valor: string | number, largo: number): string {
  return String(valor).padStart(largo, "0");
}

// --- Fechas -----------------------------------------------------------------
// Honduras es UTC-6 fijo (sin horario de verano desde 2010), así que restar 6 h
// da la hora local exacta sin depender de la zona horaria del dispositivo.

const OFFSET_HN_MS = -6 * 60 * 60 * 1000;

/** Fecha local de Honduras (YYYY-MM-DD) de un instante. */
export function fechaLocalHN(instante: Date): string {
  return new Date(instante.getTime() + OFFSET_HN_MS).toISOString().slice(0, 10);
}

/** "2030-01-31" -> "31/01/2030" */
export function formatearFecha(fechaIso: string): string {
  const [a, m, d] = fechaIso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** Instante -> "dd/mm/aaaa hh:mm:ss" en hora de Honduras. */
export function formatearFechaHora(instante: Date): string {
  const local = new Date(instante.getTime() + OFFSET_HN_MS).toISOString();
  return `${formatearFecha(local)} ${local.slice(11, 19)}`;
}

/** true si `instante` (hasta el final del día local) aún cumple la fecha límite. */
export function dentroDeFechaLimite(instante: Date, fechaLimite: string): boolean {
  return fechaLocalHN(instante) <= fechaLimite.slice(0, 10);
}

/** Días naturales entre dos fechas YYYY-MM-DD (negativo si `hasta` ya pasó). */
export function diasEntre(desde: string, hasta: string): number {
  const ms = Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

// --- Rangos -----------------------------------------------------------------

export interface RangoNumerico {
  desde: number;
  hasta: number;
}

export function validarRango(r: RangoNumerico): string | null {
  if (!Number.isInteger(r.desde) || !Number.isInteger(r.hasta)) return "Desde y hasta deben ser números enteros";
  if (r.desde < 1) return "El rango debe empezar en 1 o más";
  if (r.desde > r.hasta) return "«Desde» no puede ser mayor que «Hasta»";
  if (r.hasta > 99_999_999) return "El correlativo solo admite hasta 8 dígitos";
  return null;
}

export function rangosTraslapan(a: RangoNumerico, b: RangoNumerico): boolean {
  return a.desde <= b.hasta && b.desde <= a.hasta;
}
