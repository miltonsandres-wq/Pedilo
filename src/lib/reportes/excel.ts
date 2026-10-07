import ExcelJS from "exceljs";
import { fechaLocalHN } from "@/lib/fiscal/formato";
import { ETIQUETA_TIPO_VENTA, type VentaDia } from "@/lib/ventas/ventasDelDia";
import { etiquetaCanal } from "@/lib/pos/canales";

/**
 * Reporte en Excel del cierre de caja: resumen por día y sucursal (facturado / no facturado / anulado y
 * cada método de pago), el desglose por método, el detalle de ventas y los productos vendidos. Los números
 * van como números (no como texto) para poder sumar y filtrar en Excel.
 */

export interface CierreRegistrado {
  sucursal_id: string;
  fecha: string; // YYYY-MM-DD
  cerrado_at: string;
  cerrado_por: string | null;
}

export interface DatosExcel {
  negocio: string;
  desde: string; // YYYY-MM-DD
  hasta: string;
  sucursales: { id: string; nombre: string }[];
  ventas: VentaDia[];
  cierres: CierreRegistrado[];
  productos: { nombre: string; cantidad: number; total: number }[];
  generadoEn: Date;
}

const FORMATO_LEMPIRAS = "#,##0.00";
const ETIQUETA_FORMA: Record<string, string> = { efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia", delivery_externo: "Delivery externo" };
export const etiquetaForma = (f: string) => ETIQUETA_FORMA[f] ?? f.replaceAll("_", " ");

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Días YYYY-MM-DD entre dos fechas (ambas incluidas). */
export function diasEntre(desde: string, hasta: string): string[] {
  const dias: string[] = [];
  for (let t = Date.parse(`${desde}T00:00:00Z`); t <= Date.parse(`${hasta}T00:00:00Z`); t += 86_400_000) {
    dias.push(new Date(t).toISOString().slice(0, 10));
  }
  return dias;
}

function encabezado(hoja: ExcelJS.Worksheet, columnas: { titulo: string; ancho: number; numero?: boolean }[]) {
  hoja.columns = columnas.map((c) => ({ header: c.titulo, width: c.ancho, style: c.numero ? { numFmt: FORMATO_LEMPIRAS } : {} }));
  const fila = hoja.getRow(1);
  fila.font = { bold: true, color: { argb: "FFFFFFFF" } };
  fila.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14171E" } };
  fila.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  fila.height = 28;
  hoja.views = [{ state: "frozen", ySplit: 1 }];
}

export async function construirExcelReportes(d: DatosExcel): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Pedilo";
  wb.created = d.generadoEn;
  const nombreSucursal = new Map(d.sucursales.map((s) => [s.id, s.nombre]));
  const diaDe = (v: VentaDia) => fechaLocalHN(new Date(v.hora));
  const cierre = new Map(d.cierres.map((c) => [`${c.sucursal_id}|${c.fecha}`, c]));

  // ---- agrupación por día y sucursal ----
  const metodos = new Set<string>();
  type Grupo = { facturado: number; sinFactura: number; anulado: number; ordenes: number; porMetodo: Record<string, number> };
  const grupos = new Map<string, Grupo>();
  const desglose = new Map<string, number>(); // dia|sucursal|comprobante|metodo
  for (const v of d.ventas) {
    const clave = `${diaDe(v)}|${v.sucursalId}`;
    const g = grupos.get(clave) ?? { facturado: 0, sinFactura: 0, anulado: 0, ordenes: 0, porMetodo: {} };
    const comprobante = v.anulada ? "Anulado" : v.tipo === "con_cai" ? "Facturado" : "Ticket sin factura";
    if (v.anulada) g.anulado += v.total;
    else {
      g.ordenes += 1;
      if (v.tipo === "con_cai") g.facturado += v.total;
      else g.sinFactura += v.total;
      for (const p of v.pagos) {
        metodos.add(p.forma);
        g.porMetodo[p.forma] = (g.porMetodo[p.forma] ?? 0) + p.monto;
      }
    }
    for (const p of v.pagos) {
      metodos.add(p.forma);
      const k = `${clave}|${comprobante}|${p.forma}`;
      desglose.set(k, (desglose.get(k) ?? 0) + p.monto);
    }
    grupos.set(clave, g);
  }
  const listaMetodos = [...metodos].sort();

  // ---- Hoja 1: Resumen por día ----
  const resumen = wb.addWorksheet("Resumen por día");
  encabezado(resumen, [
    { titulo: "Fecha", ancho: 12 },
    { titulo: "Sucursal", ancho: 22 },
    { titulo: "Día", ancho: 12 },
    { titulo: "Órdenes", ancho: 10 },
    { titulo: "Facturado (CAI)", ancho: 16, numero: true },
    { titulo: "Ticket sin factura", ancho: 18, numero: true },
    { titulo: "Anulado", ancho: 12, numero: true },
    { titulo: "Total cobrado", ancho: 16, numero: true },
    ...listaMetodos.map((m) => ({ titulo: etiquetaForma(m), ancho: 15, numero: true })),
  ]);
  const totales = { ordenes: 0, facturado: 0, sinFactura: 0, anulado: 0, total: 0, metodos: Object.fromEntries(listaMetodos.map((m) => [m, 0])) as Record<string, number> };
  for (const dia of diasEntre(d.desde, d.hasta)) {
    for (const s of d.sucursales) {
      const g = grupos.get(`${dia}|${s.id}`);
      const cerrado = cierre.get(`${s.id}|${dia}`);
      if (!g && !cerrado) continue;
      const x = g ?? { facturado: 0, sinFactura: 0, anulado: 0, ordenes: 0, porMetodo: {} };
      const total = redondear(x.facturado + x.sinFactura);
      resumen.addRow([
        dia, s.nombre, cerrado ? "Cerrado" : "Abierto", x.ordenes, redondear(x.facturado), redondear(x.sinFactura), redondear(x.anulado), total,
        ...listaMetodos.map((m) => redondear(x.porMetodo[m] ?? 0)),
      ]);
      totales.ordenes += x.ordenes;
      totales.facturado += x.facturado;
      totales.sinFactura += x.sinFactura;
      totales.anulado += x.anulado;
      totales.total += total;
      for (const m of listaMetodos) totales.metodos[m] += x.porMetodo[m] ?? 0;
    }
  }
  const filaTotal = resumen.addRow([
    "TOTAL", "", "", totales.ordenes, redondear(totales.facturado), redondear(totales.sinFactura), redondear(totales.anulado), redondear(totales.total),
    ...listaMetodos.map((m) => redondear(totales.metodos[m])),
  ]);
  filaTotal.font = { bold: true };
  filaTotal.border = { top: { style: "thin" } };
  if (resumen.rowCount === 2) resumen.addRow(["Sin ventas en este periodo."]);
  resumen.addRow([]);
  resumen.addRow([`${d.negocio} · del ${d.desde} al ${d.hasta} · generado ${fechaLocalHN(d.generadoEn)}`]).font = { italic: true, color: { argb: "FF5B6577" } };

  // ---- Hoja 2: Por método de pago ----
  const porMetodo = wb.addWorksheet("Por método de pago");
  encabezado(porMetodo, [
    { titulo: "Fecha", ancho: 12 },
    { titulo: "Sucursal", ancho: 22 },
    { titulo: "Comprobante", ancho: 20 },
    { titulo: "Método de pago", ancho: 20 },
    { titulo: "Monto", ancho: 14, numero: true },
  ]);
  for (const [clave, monto] of [...desglose.entries()].sort()) {
    const [dia, sucursalId, comprobante, metodo] = clave.split("|");
    porMetodo.addRow([dia, nombreSucursal.get(sucursalId) ?? "", comprobante, etiquetaForma(metodo), redondear(monto)]);
  }

  // ---- Hoja 3: Detalle de ventas ----
  const ventas = wb.addWorksheet("Ventas");
  encabezado(ventas, [
    { titulo: "Fecha", ancho: 12 },
    { titulo: "Hora", ancho: 8 },
    { titulo: "Sucursal", ancho: 20 },
    { titulo: "Orden #", ancho: 9 },
    { titulo: "Canal", ancho: 13 },
    { titulo: "Mesa", ancho: 12 },
    { titulo: "Comprobante", ancho: 18 },
    { titulo: "N.º de factura", ancho: 24 },
    { titulo: "Cliente", ancho: 24 },
    { titulo: "Forma(s) de pago", ancho: 22 },
    { titulo: "Total", ancho: 13, numero: true },
    { titulo: "Estado", ancho: 11 },
    { titulo: "Motivo de anulación", ancho: 30 },
  ]);
  const horaHN = (iso: string) =>
    new Intl.DateTimeFormat("es-HN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Tegucigalpa" }).format(new Date(iso));
  for (const v of [...d.ventas].sort((a, b) => a.hora.localeCompare(b.hora))) {
    ventas.addRow([
      diaDe(v), horaHN(v.hora), nombreSucursal.get(v.sucursalId) ?? "", v.numeroDia ?? "", etiquetaCanal(v.canal), v.mesa ?? "",
      ETIQUETA_TIPO_VENTA[v.tipo], v.numeroFactura ?? "", v.cliente, v.formasPago.map(etiquetaForma).join(", "), redondear(v.total),
      v.anulada ? "Anulada" : "Vigente", v.motivoAnulacion ?? "",
    ]);
  }
  ventas.autoFilter = { from: "A1", to: { row: 1, column: 13 } };

  // ---- Hoja 4: Productos vendidos ----
  const productos = wb.addWorksheet("Productos");
  encabezado(productos, [
    { titulo: "Producto", ancho: 34 },
    { titulo: "Cantidad", ancho: 11 },
    { titulo: "Total vendido", ancho: 16, numero: true },
  ]);
  for (const p of [...d.productos].sort((a, b) => b.cantidad - a.cantidad)) productos.addRow([p.nombre, p.cantidad, redondear(p.total)]);

  // ---- Hoja 5: Cierres registrados ----
  const cierres = wb.addWorksheet("Cierres");
  encabezado(cierres, [
    { titulo: "Fecha", ancho: 12 },
    { titulo: "Sucursal", ancho: 22 },
    { titulo: "Cerrado el", ancho: 20 },
    { titulo: "Cerrado por", ancho: 24 },
  ]);
  for (const c of [...d.cierres].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    cierres.addRow([c.fecha, nombreSucursal.get(c.sucursal_id) ?? "", fechaLocalHN(new Date(c.cerrado_at)) + " " + horaHN(c.cerrado_at), c.cerrado_por ?? ""]);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
