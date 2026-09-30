/**
 * Libro de ventas: listado de documentos fiscales de un periodo (incluye los
 * anulados) con totales por tasa, exportable a CSV/Excel. Trabaja en centavos
 * enteros para que los totales cuadren exacto con lo impreso.
 */

export interface DocumentoLibro {
  id: string;
  fecha_emision: string;
  numero_completo: string;
  clase: string;
  estado: string;
  cliente_nombre: string;
  cliente_rtn: string | null;
  importe_exonerado: number;
  importe_exento: number;
  gravado_15: number;
  gravado_18: number;
  isv_15: number;
  isv_18: number;
  cargo_servicio: number;
  total: number;
  anulada_motivo: string | null;
  documento_referencia_id?: string | null;
}

export interface TotalesLibro {
  importe_exonerado: number;
  importe_exento: number;
  gravado_15: number;
  gravado_18: number;
  isv_15: number;
  isv_18: number;
  cargo_servicio: number;
  total: number;
}

export interface Libro {
  documentos: DocumentoLibro[];
  /** Solo documentos vigentes; las notas de crédito RESTAN. */
  totales: TotalesLibro;
  cantidadEmitidos: number;
  cantidadAnulados: number;
}

const CAMPOS_MONTO = [
  "importe_exonerado", "importe_exento", "gravado_15", "gravado_18", "isv_15", "isv_18", "cargo_servicio", "total",
] as const;

const c = (n: number) => Math.round(Number(n) * 100);

export function armarLibro(documentos: DocumentoLibro[]): Libro {
  const orden = [...documentos].sort((a, b) => a.fecha_emision.localeCompare(b.fecha_emision) || a.numero_completo.localeCompare(b.numero_completo));
  const acumulado = Object.fromEntries(CAMPOS_MONTO.map((k) => [k, 0])) as Record<(typeof CAMPOS_MONTO)[number], number>;
  let cantidadEmitidos = 0;
  let cantidadAnulados = 0;

  for (const d of orden) {
    if (d.estado === "anulada") {
      cantidadAnulados++;
      continue;
    }
    cantidadEmitidos++;
    const signo = d.clase === "nota_credito" ? -1 : 1;
    for (const k of CAMPOS_MONTO) acumulado[k] += signo * c(d[k]);
  }

  const totales = Object.fromEntries(CAMPOS_MONTO.map((k) => [k, acumulado[k] / 100])) as unknown as TotalesLibro;
  return { documentos: orden, totales, cantidadEmitidos, cantidadAnulados };
}

const ETIQUETA_CLASE: Record<string, string> = {
  factura: "Factura",
  nota_credito: "Nota de crédito",
  nota_debito: "Nota de débito",
};

function celda(valor: string | number): string {
  const texto = String(valor);
  // Comillas dobles escapadas; protege también contra "fórmulas" de Excel (=, +, -, @)
  const seguro = /^[=+\-@]/.test(texto) && !/^-?\d+(\.\d+)?$/.test(texto) ? `'${texto}` : texto;
  return /[",\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

const monto = (n: number) => Number(n).toFixed(2);

/** `formatearFecha`: cómo mostrar la fecha de emisión (hora local de Honduras). */
export function libroACsv(libro: Libro, formatearFecha: (iso: string) => string): string {
  const encabezado = [
    "Fecha", "Documento", "Tipo", "Estado", "Cliente", "RTN cliente", "Importe exonerado", "Importe exento",
    "Gravado 15%", "Gravado 18%", "ISV 15%", "ISV 18%", "Cargo por servicio", "Total", "Motivo de anulación",
  ];
  const filas = libro.documentos.map((d) => {
    const anulada = d.estado === "anulada";
    const signo = d.clase === "nota_credito" ? -1 : 1;
    // Se listan TODOS, con su monto real; la fila de totales suma solo los vigentes
    const m = (n: number) => monto(signo * Number(n));
    return [
      formatearFecha(d.fecha_emision), d.numero_completo, ETIQUETA_CLASE[d.clase] ?? d.clase,
      anulada ? "Anulada" : "Emitida", d.cliente_nombre, d.cliente_rtn ?? "",
      m(d.importe_exonerado), m(d.importe_exento), m(d.gravado_15), m(d.gravado_18), m(d.isv_15), m(d.isv_18),
      m(d.cargo_servicio), m(d.total), d.anulada_motivo ?? "",
    ];
  });
  const t = libro.totales;
  const totales = [
    "", "TOTALES (vigentes; las notas de crédito restan)", "", "", "", "", monto(t.importe_exonerado), monto(t.importe_exento),
    monto(t.gravado_15), monto(t.gravado_18), monto(t.isv_15), monto(t.isv_18), monto(t.cargo_servicio), monto(t.total), "",
  ];
  // BOM para que Excel abra los acentos bien; CRLF por compatibilidad
  return "﻿" + [encabezado, ...filas, totales].map((f) => f.map(celda).join(",")).join("\r\n") + "\r\n";
}
