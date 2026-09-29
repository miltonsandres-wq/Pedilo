/**
 * Monto en letras para la factura, en español y mayúsculas:
 * 285.50 -> "DOSCIENTOS OCHENTA Y CINCO LEMPIRAS CON 50/100".
 */

const UNIDADES = [
  "CERO", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE",
  "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISEIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE",
  "VEINTE", "VEINTIUN", "VEINTIDOS", "VEINTITRES", "VEINTICUATRO", "VEINTICINCO", "VEINTISEIS", "VEINTISIETE",
  "VEINTIOCHO", "VEINTINUEVE",
];
const DECENAS = ["", "", "", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const CENTENAS = [
  "", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS",
  "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS",
];

function menorQueMil(n: number): string {
  if (n === 100) return "CIEN";
  const partes: string[] = [];
  const c = Math.floor(n / 100);
  const resto = n % 100;
  if (c > 0) partes.push(CENTENAS[c]);
  if (resto > 0) {
    if (resto < 30) {
      partes.push(UNIDADES[resto]);
    } else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(u === 0 ? DECENAS[d] : `${DECENAS[d]} Y ${UNIDADES[u]}`);
    }
  }
  return partes.join(" ");
}

/** Entero >= 0 y < 1 000 000 000 000 en letras (sin moneda). */
export function numeroALetras(n: number): string {
  if (!Number.isInteger(n) || n < 0) throw new Error("Solo se convierten enteros no negativos");
  if (n >= 1_000_000_000_000) throw new Error("Monto demasiado grande");
  if (n === 0) return "CERO";

  const partes: string[] = [];
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;

  if (millones > 0) {
    partes.push(millones === 1 ? "UN MILLON" : `${numeroALetras(millones)} MILLONES`);
  }
  if (miles > 0) {
    partes.push(miles === 1 ? "MIL" : `${menorQueMil(miles)} MIL`);
  }
  if (resto > 0) partes.push(menorQueMil(resto));
  return partes.join(" ");
}

export function totalEnLetras(monto: number): string {
  if (!Number.isFinite(monto) || monto < 0) throw new Error("Monto inválido");
  const centavosTotales = Math.round(monto * 100);
  const enteros = Math.floor(centavosTotales / 100);
  const centavos = centavosTotales % 100;

  const moneda =
    enteros === 1 ? "LEMPIRA" : enteros > 0 && enteros % 1_000_000 === 0 ? "DE LEMPIRAS" : "LEMPIRAS";

  return `${numeroALetras(enteros)} ${moneda} CON ${String(centavos).padStart(2, "0")}/100`;
}
