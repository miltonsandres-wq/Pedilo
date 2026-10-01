/**
 * Validaciones del pedido de delivery. Se usan en el checkout (feedback al
 * instante) y en el servidor; la base de datos las vuelve a exigir con sus
 * propios CHECK, así que esto solo da mensajes claros en español.
 */

/** Deja solo dígitos; acepta "+504 9988-7766", "9988 7766", "(504) 99887766". */
export function normalizarTelefonoHN(entrada: string): string {
  const digitos = entrada.replace(/\D/g, "");
  return digitos.length === 11 && digitos.startsWith("504") ? digitos.slice(3) : digitos;
}

export const esTelefonoHN = (entrada: string) => /^[2389]\d{7}$/.test(normalizarTelefonoHN(entrada));

export const normalizarRtn = (entrada: string) => entrada.replace(/\D/g, "");
export const esRtn = (entrada: string) => /^\d{14}$/.test(normalizarRtn(entrada));

export type MetodoPago = "efectivo" | "tarjeta_contra_entrega" | "transferencia";

export const ETIQUETA_METODO: Record<MetodoPago, string> = {
  efectivo: "Efectivo",
  tarjeta_contra_entrega: "Tarjeta contra entrega",
  transferencia: "Transferencia",
};

export interface DatosCheckout {
  nombre: string;
  telefono: string;
  zonaId: string;
  direccionReferencia: string;
  metodoPago: MetodoPago | "";
  pagaCon: string;
  conRtn: boolean;
  facturaNombre: string;
  facturaRtn: string;
}

export type ErroresCheckout = Partial<Record<keyof DatosCheckout, string>>;

/** Valida el formulario del checkout; devuelve los errores por campo (vacío = todo bien). */
export function validarCheckout(d: DatosCheckout, totalConEnvio: number, metodosHabilitados: MetodoPago[]): ErroresCheckout {
  const e: ErroresCheckout = {};
  if (d.nombre.trim().length < 2) e.nombre = "Escribe tu nombre";
  if (!esTelefonoHN(d.telefono)) e.telefono = "El teléfono debe tener 8 dígitos (ej. 9988-7766)";
  if (!d.zonaId) e.zonaId = "Elige tu zona";
  if (d.direccionReferencia.trim().length < 5) {
    e.direccionReferencia = "Escribe una referencia para encontrarte (ej. portón negro, frente a la pulpería)";
  }
  if (!d.metodoPago || !metodosHabilitados.includes(d.metodoPago)) {
    e.metodoPago = "Elige cómo vas a pagar";
  } else if (d.metodoPago === "efectivo" && d.pagaCon.trim() !== "") {
    const monto = Number(d.pagaCon.replace(",", "."));
    if (!Number.isFinite(monto) || monto <= 0) e.pagaCon = "Escribe un monto válido";
    else if (monto < totalConEnvio) e.pagaCon = `Con eso no alcanza: el total es L ${totalConEnvio.toFixed(2)}`;
  }
  if (d.conRtn) {
    if (d.facturaNombre.trim().length < 2) e.facturaNombre = "Escribe el nombre o razón social";
    if (!esRtn(d.facturaRtn)) e.facturaRtn = "El RTN debe tener 14 dígitos";
  }
  return e;
}

/** Cambio que debe llevar el repartidor (0 si no hay "paga con" o no es efectivo). */
export function calcularCambio(total: number, pagaCon: number | null | undefined): number {
  if (!pagaCon || pagaCon <= total) return 0;
  return Math.round((pagaCon - total) * 100) / 100;
}

export const formatearLempiras = (n: number) =>
  `L ${n.toLocaleString("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
