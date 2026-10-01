import { formatearFechaHora } from "@/lib/fiscal/formato";
import { COLUMNAS, dinero, envolver, par } from "./documentoTexto";
import type { Instruccion, InstruccionTexto } from "./types";

/**
 * Comprobante de entrega (ticket de 80 mm / 48 columnas) que sale junto con la
 * factura y viaja con el repartidor. NO es documento fiscal y NO consume
 * correlativo: es solo una hoja de ruta (a quién, dónde y cuánto cobrar).
 * Función pura: no toca red, impresora ni la numeración fiscal.
 */

export interface DatosComprobanteEntrega {
  restaurante: string;
  numeroPedido: number | null;
  fechaHora: Date;
  cliente: string;
  telefono: string;
  zona: string | null;
  referencia: string;
  items: { cantidad: number; nombre: string }[];
  subtotal: number;
  envio: number;
  total: number;
  metodoPagoEtiqueta: string;
  /** Con cuánto va a pagar el cliente (solo efectivo). */
  pagaCon: number | null;
  /** Número de la factura fiscal asociada; null si el negocio no factura. */
  facturaNumero: string | null;
  repartidor?: string | null;
}

const COLUMNAS_DOBLE = COLUMNAS / 2;

const texto = (t: string, extra: Omit<InstruccionTexto, "op" | "texto"> = {}): InstruccionTexto => ({
  op: "texto",
  texto: t,
  ...extra,
});

const centrado = (t: string, extra: Omit<InstruccionTexto, "op" | "texto" | "align"> = {}) =>
  envolver(t, extra.size === "doble" ? COLUMNAS_DOBLE : COLUMNAS).map((l) => texto(l, { ...extra, align: "center" }));

export const NOTA_NO_FISCAL = "NO ES DOCUMENTO FISCAL";

export function construirComprobanteEntrega(d: DatosComprobanteEntrega): Instruccion[] {
  const out: Instruccion[] = [];
  out.push(...centrado(d.restaurante, { bold: true, size: "doble" }));
  out.push(...centrado("COMPROBANTE DE ENTREGA", { bold: true }));
  out.push({ op: "linea" });

  out.push(...par("Pedido:", d.numeroPedido != null ? `#${d.numeroPedido}` : "—").map((t) => texto(t, { bold: true })));
  out.push(...par("Hora:", formatearFechaHora(d.fechaHora)).map((t) => texto(t)));
  if (d.repartidor) out.push(...par("Repartidor:", d.repartidor).map((t) => texto(t)));
  out.push({ op: "linea" });

  out.push(texto("Cliente:", { bold: true }), ...envolver(d.cliente, COLUMNAS).map((l) => texto(l)));
  out.push(...par("Teléfono:", d.telefono).map((t) => texto(t)));
  if (d.zona) out.push(...par("Zona:", d.zona).map((t) => texto(t)));

  // La referencia es lo que el repartidor lee con el casco puesto: letra GRANDE
  out.push({ op: "salto" }, texto("DIRECCIÓN:", { bold: true }));
  out.push(...envolver(d.referencia, COLUMNAS_DOBLE).map((l) => texto(l, { size: "doble", bold: true })));
  out.push({ op: "linea" });

  out.push(texto("Detalle:", { bold: true }));
  for (const i of d.items) {
    const lineas = envolver(`${i.cantidad} x ${i.nombre}`, COLUMNAS - 2);
    out.push(texto(lineas[0]), ...lineas.slice(1).map((l) => texto(`   ${l}`)));
  }
  out.push({ op: "linea" });

  out.push(...par("Subtotal:", `L ${dinero(d.subtotal)}`).map((t) => texto(t)));
  out.push(...par("Envío:", `L ${dinero(d.envio)}`).map((t) => texto(t)));
  out.push(...centrado(`TOTAL A COBRAR: L ${dinero(d.total)}`, { bold: true, size: "doble" }));
  out.push(...par("Método de pago:", d.metodoPagoEtiqueta).map((t) => texto(t, { bold: true })));

  if (d.pagaCon && d.pagaCon > 0) {
    const cambio = Math.max(0, Math.round((d.pagaCon - d.total) * 100) / 100);
    out.push(texto(`Paga con: L ${dinero(d.pagaCon)}  /  Cambio: L ${dinero(cambio)}`, { bold: true }));
  }

  out.push({ op: "linea" });
  out.push(...par("Factura:", d.facturaNumero ?? "Sin factura").map((t) => texto(t)));

  out.push({ op: "salto" });
  out.push(...centrado(NOTA_NO_FISCAL, { bold: true }));
  out.push({ op: "salto", n: 3 }, { op: "cortar" });
  return out;
}
