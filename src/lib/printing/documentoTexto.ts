import { formatearFecha, formatearFechaHora, formatearNumeroDocumento } from "@/lib/fiscal/formato";
import type { Instruccion, InstruccionTexto } from "./types";

/**
 * Armado de tickets de 80 mm (48 columnas): factura fiscal, nota de crédito y
 * pre-cuenta. Funciones puras: reciben datos y devuelven instrucciones; no
 * tocan red ni impresora (ver enviarComanda.ts y print-agent/index.js).
 */

export const COLUMNAS = 48;
const COLUMNAS_DOBLE = COLUMNAS / 2;

export interface LineaImprimible {
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  total: number;
}

export interface EmisorImprimible {
  razon_social: string | null;
  nombre_comercial: string | null;
  rtn: string | null;
  direccion_fiscal: string | null;
  telefono: string | null;
  correo: string | null;
}

/** Lo que necesita imprimir una factura o nota (coincide con la fila de documentos_fiscales). */
export interface DocumentoImprimible {
  clase: string;
  estado: string;
  numero_completo: string;
  cai: string;
  rango_desde: number;
  rango_hasta: number;
  establecimiento: string;
  punto_emision: string;
  tipo_doc: string;
  fecha_limite: string;
  fecha_emision: string;
  emisor_snapshot: EmisorImprimible;
  cliente_nombre: string;
  cliente_rtn: string | null;
  no_orden_compra_exenta: string | null;
  no_constancia_exonerado: string | null;
  no_registro_sag: string | null;
  importe_exonerado: number;
  importe_exento: number;
  gravado_15: number;
  gravado_18: number;
  isv_15: number;
  isv_18: number;
  cargo_servicio: number;
  total: number;
  total_letras: string;
  lineas: LineaImprimible[];
  motivo_nota?: string | null;
}

export interface OpcionesFactura {
  /** "cliente" = "Original: Cliente" (por defecto); "emisor" = "Copia: Emisor". */
  copia?: "cliente" | "emisor";
  /** Reimpresión: se marca "REIMPRESIÓN" y NO consume correlativo. */
  reimpresion?: boolean;
  /** Para notas de crédito/débito: el documento que corrigen. */
  referencia?: { numero_completo: string; cai: string; fecha_emision: string } | null;
}

// --- utilidades de texto ----------------------------------------------------

/** Parte un texto en líneas de máximo `ancho` caracteres, cortando por palabras. */
export function envolver(texto: string, ancho: number): string[] {
  const salida: string[] = [];
  for (const parrafo of texto.split("\n")) {
    let actual = "";
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      let p = palabra;
      while (p.length > ancho) {
        if (actual) {
          salida.push(actual);
          actual = "";
        }
        salida.push(p.slice(0, ancho));
        p = p.slice(ancho);
      }
      if (!actual) actual = p;
      else if (actual.length + 1 + p.length <= ancho) actual += ` ${p}`;
      else {
        salida.push(actual);
        actual = p;
      }
    }
    salida.push(actual);
  }
  return salida.length ? salida : [""];
}

export function dinero(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "izquierda ........ derecha" en `ancho` columnas; si no cabe, envuelve la izquierda. */
export function par(izq: string, der: string, ancho = COLUMNAS): string[] {
  if (izq.length + 1 + der.length <= ancho) {
    return [izq + " ".repeat(ancho - izq.length - der.length) + der];
  }
  const lineas = envolver(izq, Math.max(1, ancho - der.length - 1));
  const ultima = lineas.pop()!;
  return [...lineas, ultima + " ".repeat(Math.max(1, ancho - ultima.length - der.length)) + der];
}

const texto = (t: string, extra: Omit<InstruccionTexto, "op" | "texto"> = {}): InstruccionTexto => ({
  op: "texto",
  texto: t,
  ...extra,
});

function centrado(t: string, extra: Omit<InstruccionTexto, "op" | "texto" | "align"> = {}): InstruccionTexto[] {
  const ancho = extra.size === "doble" ? COLUMNAS_DOBLE : COLUMNAS;
  return envolver(t, ancho).map((l) => texto(l, { ...extra, align: "center" }));
}

function izquierda(t: string, extra: Omit<InstruccionTexto, "op" | "texto" | "align"> = {}): InstruccionTexto[] {
  return envolver(t, COLUMNAS).map((l) => texto(l, { ...extra, align: "left" }));
}

/** Etiqueta con valor: en la misma línea si cabe, si no el valor va debajo con sangría. */
function campo(etiqueta: string, valor: string | null | undefined): InstruccionTexto[] {
  const v = valor?.trim() ?? "";
  if (etiqueta.length + 1 + v.length <= COLUMNAS) return [texto(`${etiqueta} ${v}`.trimEnd())];
  return [texto(etiqueta), ...envolver(v, COLUMNAS - 2).map((l) => texto(`  ${l}`))];
}

function filasDetalle(lineas: LineaImprimible[]): InstruccionTexto[] {
  const out: InstruccionTexto[] = [
    texto(`${"CANT".padEnd(5)}${"DESCRIPCIÓN".padEnd(30)}${"TOTAL".padStart(13)}`, { bold: true }),
  ];
  for (const l of lineas) {
    const desc = envolver(l.nombre, 30);
    out.push(texto(`${String(l.cantidad).padEnd(5)}${desc[0].padEnd(30)}${dinero(l.total).padStart(13)}`));
    for (const extra of desc.slice(1)) out.push(texto(`${" ".repeat(5)}${extra}`));
  }
  return out;
}

function encabezadoEmisor(e: EmisorImprimible): Instruccion[] {
  const out: Instruccion[] = [{ op: "logo" }];
  const comercial = e.nombre_comercial || e.razon_social || "";
  if (comercial) out.push(...centrado(comercial, { bold: true, size: "doble" }));
  if (e.razon_social && e.razon_social !== comercial) out.push(...centrado(e.razon_social));
  if (e.rtn) out.push(...centrado(`RTN: ${e.rtn}`));
  if (e.direccion_fiscal) out.push(...centrado(e.direccion_fiscal));
  if (e.telefono) out.push(...centrado(`Tel: ${e.telefono}`));
  if (e.correo) out.push(...centrado(e.correo));
  return out;
}

const TITULOS: Record<string, string> = {
  factura: "FACTURA",
  nota_credito: "NOTA DE CRÉDITO",
  nota_debito: "NOTA DE DÉBITO",
};

// --- factura ----------------------------------------------------------------

export function construirFactura(doc: DocumentoImprimible, opciones: OpcionesFactura = {}): Instruccion[] {
  const out: Instruccion[] = [...encabezadoEmisor(doc.emisor_snapshot), { op: "salto" }];

  out.push(...centrado(TITULOS[doc.clase] ?? "FACTURA", { bold: true, size: "doble" }));
  if (doc.estado === "anulada") out.push(...centrado("*** ANULADA ***", { bold: true }));
  if (opciones.reimpresion) out.push(...centrado("*** REIMPRESIÓN ***", { bold: true }));
  out.push({ op: "salto" });

  out.push(...campo("No.:", doc.numero_completo));
  out.push(texto("CAI:"), texto(doc.cai));
  out.push(...campo("Fecha:", formatearFechaHora(new Date(doc.fecha_emision))));

  if (opciones.referencia) {
    out.push({ op: "linea" }, texto("Documento de referencia:", { bold: true }));
    out.push(...campo("No.:", opciones.referencia.numero_completo));
    out.push(texto("CAI:"), texto(opciones.referencia.cai));
    out.push(...campo("Fecha:", formatearFechaHora(new Date(opciones.referencia.fecha_emision))));
    if (doc.motivo_nota) out.push(...campo("Motivo:", doc.motivo_nota));
  }

  out.push({ op: "linea" });
  out.push(...campo("Cliente:", doc.cliente_nombre || "Consumidor Final"));
  out.push(...campo("RTN:", doc.cliente_rtn));

  out.push({ op: "linea" });
  out.push(...filasDetalle(doc.lineas));

  out.push({ op: "linea" });
  const fila = (etiqueta: string, valor: number) => par(etiqueta, dinero(valor)).map((t) => texto(t));
  out.push(...fila("Importe Exonerado:", doc.importe_exonerado));
  out.push(...fila("Importe Exento:", doc.importe_exento));
  out.push(...fila("Importe Gravado 15%:", doc.gravado_15));
  out.push(...fila("Importe Gravado 18%:", doc.gravado_18));
  out.push(...fila("ISV 15%:", doc.isv_15));
  out.push(...fila("ISV 18%:", doc.isv_18));
  if (doc.cargo_servicio > 0) out.push(...fila("Cargo por servicio:", doc.cargo_servicio));
  out.push(...par("TOTAL L.", dinero(doc.total)).map((t) => texto(t, { bold: true })));

  out.push({ op: "salto" });
  out.push(...izquierda(`SON: ${doc.total_letras}`));

  // Estos tres se imprimen SIEMPRE, aunque estén vacíos
  out.push({ op: "linea" });
  out.push(...campo("No. Orden de Compra Exenta:", doc.no_orden_compra_exenta));
  out.push(...campo("No. Constancia Registro Exonerado:", doc.no_constancia_exonerado));
  out.push(...campo("No. Registro SAG:", doc.no_registro_sag));

  const num = (correlativo: number) =>
    formatearNumeroDocumento({
      establecimiento: doc.establecimiento,
      puntoEmision: doc.punto_emision,
      tipoDoc: doc.tipo_doc,
      correlativo,
    });
  out.push({ op: "linea" });
  out.push(texto("Rango autorizado:"));
  out.push(texto(`Del ${num(doc.rango_desde)}`));
  out.push(texto(`Al  ${num(doc.rango_hasta)}`));
  out.push(...campo("Fecha límite de emisión:", formatearFecha(doc.fecha_limite)));

  out.push({ op: "salto" });
  out.push(...centrado("La factura es beneficio de todos, ¡exíjala!"));
  out.push(...centrado(opciones.copia === "emisor" ? "Copia: Emisor" : "Original: Cliente", { bold: true }));

  out.push({ op: "salto", n: 3 }, { op: "cortar" });
  return out;
}

// --- pre-cuenta -------------------------------------------------------------

export interface DatosPrecuenta {
  emisor: EmisorImprimible | null;
  /** Solo se usa si no hay datos fiscales del emisor. */
  nombreNegocio: string;
  mesa: string;
  numeroDia: number | null;
  clienteNombre: string | null;
  fecha: Date;
  lineas: LineaImprimible[];
  total: number;
}

export function construirPrecuenta(d: DatosPrecuenta): Instruccion[] {
  const out: Instruccion[] = [{ op: "logo" }];
  const comercial = d.emisor?.nombre_comercial || d.emisor?.razon_social || d.nombreNegocio;
  out.push(...centrado(comercial, { bold: true, size: "doble" }));
  if (d.emisor?.telefono) out.push(...centrado(`Tel: ${d.emisor.telefono}`));

  out.push({ op: "salto" });
  out.push(...centrado("PRE-CUENTA", { bold: true, size: "doble" }));
  out.push(...centrado("NO ES DOCUMENTO FISCAL", { bold: true }));
  out.push({ op: "salto" });

  out.push(...campo("Mesa:", d.mesa));
  if (d.numeroDia != null) out.push(...campo("Orden:", `#${d.numeroDia}`));
  if (d.clienteNombre) out.push(...campo("Cliente:", d.clienteNombre));
  out.push(...campo("Fecha:", formatearFechaHora(d.fecha)));

  out.push({ op: "linea" });
  out.push(...filasDetalle(d.lineas));

  out.push({ op: "linea" });
  out.push(...par("TOTAL A PAGAR L.", dinero(d.total)).map((t) => texto(t, { bold: true })));
  out.push(...centrado("Precios con ISV incluido"));

  out.push({ op: "salto" });
  out.push(...centrado("NO ES DOCUMENTO FISCAL", { bold: true }));
  out.push(...centrado("Solicite su factura al pagar"));

  out.push({ op: "salto", n: 3 }, { op: "cortar" });
  return out;
}
