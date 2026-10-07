import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { construirExcelReportes, diasEntre, type DatosExcel } from "@/lib/reportes/excel";
import { problemasParaCerrar } from "@/lib/reportes/cerrarDia";
import { rangoDelDia } from "@/lib/reportes/cierreDiario";
import { enLotes } from "@/lib/ventas/lotes";
import type { VentaDia } from "@/lib/ventas/ventasDelDia";

const venta = (ordenId: string, over: Partial<VentaDia>): VentaDia => ({
  ordenId, sucursalId: "S1", mesa: "Mesa 1", canal: "local", numeroDia: 1, hora: "2026-10-07T18:30:00Z", cliente: "Consumidor Final",
  tipo: "con_cai", documentoId: null, numeroFactura: null, formasPago: ["efectivo"], pagos: [{ forma: "efectivo", monto: 115 }], total: 115,
  anulada: false, motivoAnulacion: null, solicitud: null, ...over,
});

const datos = (over: Partial<DatosExcel> = {}): DatosExcel => ({
  negocio: "Fondita Doña Ana",
  desde: "2026-10-07",
  hasta: "2026-10-08",
  sucursales: [{ id: "S1", nombre: "Centro" }],
  ventas: [
    venta("1", { numeroFactura: "001-001-01-00000001", total: 115, pagos: [{ forma: "efectivo", monto: 115 }] }),
    venta("2", { numeroFactura: "001-001-01-00000002", total: 230, pagos: [{ forma: "tarjeta", monto: 230 }], numeroDia: 2 }),
    venta("3", { tipo: "sin_factura", total: 60, pagos: [{ forma: "efectivo", monto: 60 }], formasPago: ["efectivo"], numeroDia: 3, canal: "plataforma", mesa: null }),
    venta("4", { tipo: "sin_factura", total: 80, pagos: [{ forma: "transferencia", monto: 80 }], anulada: true, motivoAnulacion: "Cobro duplicado", numeroDia: 4 }),
  ],
  cierres: [{ sucursal_id: "S1", fecha: "2026-10-07", cerrado_at: "2026-10-08T04:00:00Z", cerrado_por: "Ana" }],
  productos: [{ nombre: "Coca-Cola", cantidad: 6, total: 180 }, { nombre: "Baleada", cantidad: 9, total: 405 }],
  generadoEn: new Date("2026-10-08T12:00:00Z"),
  ...over,
});

async function leer(d: DatosExcel) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await construirExcelReportes(d)) as unknown as ArrayBuffer);
  return wb;
}
const filas = (hoja: ExcelJS.Worksheet) => {
  const out: unknown[][] = [];
  hoja.eachRow((r) => out.push((r.values as unknown[]).slice(1)));
  return out;
};

describe("Excel del cierre", () => {
  it("trae las hojas: resumen, por método, ventas, productos y cierres", async () => {
    const wb = await leer(datos());
    expect(wb.worksheets.map((h) => h.name)).toEqual(["Resumen por día", "Por método de pago", "Ventas", "Productos", "Cierres"]);
  });

  it("el resumen separa facturado, ticket sin factura y anulado, y cada método de pago", async () => {
    const wb = await leer(datos());
    const [encabezado, dia, total] = filas(wb.getWorksheet("Resumen por día")!);
    expect(encabezado).toEqual(["Fecha", "Sucursal", "Día", "Órdenes", "Facturado (CAI)", "Ticket sin factura", "Anulado", "Total cobrado", "Efectivo", "Tarjeta", "Transferencia"]);
    // 1 sola fila de día (las ventas son del 7 de octubre en Honduras) con el día CERRADO
    expect(dia.slice(0, 8)).toEqual(["2026-10-07", "Centro", "Cerrado", 3, 345, 60, 80, 405]);
    // los métodos suman lo cobrado sin lo anulado: efectivo 115+60, tarjeta 230, transferencia 0 (la de 80 está anulada)
    expect(dia.slice(8)).toEqual([175, 230, 0]);
    expect(total.slice(0, 8)).toEqual(["TOTAL", "", "", 3, 345, 60, 80, 405]);
  });

  it("los importes son números (se pueden sumar en Excel), no texto", async () => {
    const wb = await leer(datos());
    const fila = wb.getWorksheet("Resumen por día")!.getRow(2);
    for (const c of [4, 5, 6, 7, 8]) expect(typeof fila.getCell(c).value).toBe("number");
  });

  it("el desglose por método de pago separa Facturado / Ticket sin factura / Anulado", async () => {
    const wb = await leer(datos());
    const lista = filas(wb.getWorksheet("Por método de pago")!).slice(1);
    expect(lista).toContainEqual(["2026-10-07", "Centro", "Facturado", "Efectivo", 115]);
    expect(lista).toContainEqual(["2026-10-07", "Centro", "Facturado", "Tarjeta", 230]);
    expect(lista).toContainEqual(["2026-10-07", "Centro", "Ticket sin factura", "Efectivo", 60]);
    expect(lista).toContainEqual(["2026-10-07", "Centro", "Anulado", "Transferencia", 80]);
  });

  it("el detalle de ventas trae canal, comprobante, factura, estado y motivo de anulación", async () => {
    const wb = await leer(datos());
    const lista = filas(wb.getWorksheet("Ventas")!).slice(1);
    expect(lista).toHaveLength(4);
    const plataforma = lista.find((f) => f[3] === 3)!;
    expect(plataforma[4]).toBe("Plataforma");
    expect(plataforma[6]).toBe("Ticket sin factura");
    const anulada = lista.find((f) => f[3] === 4)!;
    expect(anulada[11]).toBe("Anulada");
    expect(anulada[12]).toBe("Cobro duplicado");
    expect(lista.find((f) => f[3] === 1)![7]).toBe("001-001-01-00000001");
  });

  it("los productos salen del más vendido al menos vendido", async () => {
    const wb = await leer(datos());
    const lista = filas(wb.getWorksheet("Productos")!).slice(1);
    expect(lista).toEqual([["Baleada", 9, 405], ["Coca-Cola", 6, 180]]);
  });

  it("la hora de la venta se toma en Honduras: 02:00 UTC del 8 es la noche del 7", async () => {
    const wb = await leer(datos({ ventas: [venta("9", { hora: "2026-10-08T02:00:00Z" })], cierres: [] }));
    const resumen = filas(wb.getWorksheet("Resumen por día")!);
    expect(resumen[1][0]).toBe("2026-10-07");
    expect(resumen[1][2]).toBe("Abierto");
  });

  it("sin ventas avisa en lugar de dejar el reporte vacío", async () => {
    const wb = await leer(datos({ ventas: [], cierres: [], productos: [] }));
    expect(JSON.stringify(filas(wb.getWorksheet("Resumen por día")!))).toContain("Sin ventas en este periodo.");
  });
});

describe("cerrar el día", () => {
  const base = { fecha: "2026-10-07", hoy: "2026-10-07", yaCerrado: false, pedidosAbiertos: 0, anulacionesPendientes: 0 };

  it("se puede cerrar cuando no hay nada pendiente", () => {
    expect(problemasParaCerrar(base)).toBeNull();
  });
  it("no deja cerrar un día futuro ni uno ya cerrado", () => {
    expect(problemasParaCerrar({ ...base, fecha: "2026-10-08" })).toMatch(/todavía no llega/);
    expect(problemasParaCerrar({ ...base, yaCerrado: true })).toMatch(/ya está cerrado/);
  });
  it("no deja cerrar con pedidos abiertos ni con anulaciones por resolver", () => {
    expect(problemasParaCerrar({ ...base, pedidosAbiertos: 2 })).toMatch(/2 pedidos abiertos/);
    expect(problemasParaCerrar({ ...base, pedidosAbiertos: 1 })).toMatch(/1 pedido abierto/);
    expect(problemasParaCerrar({ ...base, anulacionesPendientes: 1 })).toMatch(/solicitud de anulación pendiente/);
  });
});

describe("utilidades del cierre", () => {
  it("diasEntre incluye ambos extremos", () => {
    expect(diasEntre("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });
  it("el día se mide en hora de Honduras (no en la del servidor)", () => {
    expect(rangoDelDia("2026-10-07")).toEqual({ desde: "2026-10-07T06:00:00.000Z", hasta: "2026-10-08T05:59:59.999Z" });
  });
  it("las consultas con muchos ids se parten en lotes", () => {
    const ids = Array.from({ length: 200 }, (_, i) => i);
    const lotes = enLotes(ids, 80);
    expect(lotes.map((l) => l.length)).toEqual([80, 80, 40]);
    expect(lotes.flat()).toEqual(ids);
  });
});
