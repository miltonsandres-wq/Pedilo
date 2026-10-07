import { describe, it, expect } from "vitest";
import { clasificarVentas, fechaValida, rangoDiaHN, resumirVentas, type FacturaVenta, type OrdenPagada, type SolicitudVenta } from "@/lib/ventas/ventasDelDia";

const orden = (id: string, total: number, hora: string, over: Partial<OrdenPagada> = {}): OrdenPagada => ({
  id, sucursal_id: "S1", mesa_id: "M1", numero_dia: 1, cliente_nombre: null, total, pagada_at: hora, ...over,
});
const factura = (orden_id: string, total: number, over: Partial<FacturaVenta> = {}): FacturaVenta => ({
  id: `F-${orden_id}`, orden_id, numero_completo: `001-001-01-0000000${orden_id}`, cliente_nombre: "Consumidor Final",
  cliente_rtn: null, total, estado: "emitida", anulada_motivo: null, ...over,
});
const solicitud = (orden_id: string, estado: SolicitudVenta["estado"], created_at = "2026-10-07T15:00:00Z"): SolicitudVenta => ({
  id: `S-${orden_id}-${estado}`, orden_id, estado, motivo: "Cobro duplicado", respuesta: null, created_at,
});

const base = {
  ordenes: [
    orden("1", 115, "2026-10-07T14:00:00Z"),
    orden("2", 230, "2026-10-07T15:00:00Z"),
    orden("3", 60, "2026-10-07T16:00:00Z"),
    orden("4", 80, "2026-10-07T17:00:00Z"),
  ],
  pagos: [
    { orden_id: "1", forma_pago: "efectivo", monto: 115 },
    { orden_id: "2", forma_pago: "tarjeta", monto: 230 },
    { orden_id: "3", forma_pago: "delivery_externo", monto: 60 },
    { orden_id: "4", forma_pago: "efectivo", monto: 80 },
  ],
  facturas: [factura("1", 115), factura("2", 230)],
  solicitudes: [] as SolicitudVenta[],
  mesas: new Map([["M1", "Mesa 1"]]),
};

describe("clasificarVentas", () => {
  it("separa con CAI, sin CAI y sin factura (delivery externo), de la más reciente a la más antigua", () => {
    const v = clasificarVentas(base);
    expect(v.map((x) => [x.ordenId, x.tipo])).toEqual([
      ["4", "sin_cai"],
      ["3", "sin_factura"],
      ["2", "con_cai"],
      ["1", "con_cai"],
    ]);
    expect(v.find((x) => x.ordenId === "1")).toMatchObject({ numeroFactura: "001-001-01-00000001", mesa: "Mesa 1", total: 115 });
  });

  it("una factura anulada cuenta como anulada, con su motivo", () => {
    const v = clasificarVentas({ ...base, facturas: [factura("1", 115, { estado: "anulada", anulada_motivo: "Error de monto" }), factura("2", 230)] });
    expect(v.find((x) => x.ordenId === "1")).toMatchObject({ anulada: true, motivoAnulacion: "Error de monto", tipo: "con_cai" });
  });

  it("un cobro sin CAI queda anulado solo cuando el admin aprueba; pendiente o rechazada no lo anulan", () => {
    const pend = clasificarVentas({ ...base, solicitudes: [solicitud("4", "pendiente")] }).find((x) => x.ordenId === "4")!;
    expect(pend).toMatchObject({ anulada: false, solicitud: { estado: "pendiente" } });
    const rech = clasificarVentas({ ...base, solicitudes: [solicitud("4", "rechazada")] }).find((x) => x.ordenId === "4")!;
    expect(rech.anulada).toBe(false);
    const apro = clasificarVentas({ ...base, solicitudes: [solicitud("4", "aprobada")] }).find((x) => x.ordenId === "4")!;
    expect(apro).toMatchObject({ anulada: true, motivoAnulacion: "Cobro duplicado" });
  });

  it("con varias solicitudes se muestra la más reciente", () => {
    const v = clasificarVentas({
      ...base,
      solicitudes: [solicitud("4", "rechazada", "2026-10-07T17:30:00Z"), solicitud("4", "pendiente", "2026-10-07T18:00:00Z")],
    }).find((x) => x.ordenId === "4")!;
    expect(v.solicitud?.estado).toBe("pendiente");
  });
});

describe("resumirVentas", () => {
  it("suma por tipo y deja lo anulado aparte, fuera del total del día", () => {
    const r = resumirVentas(clasificarVentas({ ...base, solicitudes: [solicitud("4", "aprobada")] }));
    expect(r.porTipo.con_cai).toEqual({ cantidad: 2, total: 345 });
    expect(r.porTipo.sin_factura).toEqual({ cantidad: 1, total: 60 });
    expect(r.porTipo.sin_cai).toEqual({ cantidad: 0, total: 0 });
    expect(r.anuladas).toEqual({ cantidad: 1, total: 80 });
    expect(r.neto).toEqual({ cantidad: 3, total: 405 });
  });
});

describe("fechas de Honduras", () => {
  it("el día de Honduras empieza a las 06:00 UTC y termina a las 05:59:59 UTC del día siguiente", () => {
    const { desde, hasta } = rangoDiaHN("2026-10-07");
    expect(desde).toBe("2026-10-07T06:00:00.000Z");
    expect(hasta).toBe("2026-10-08T05:59:59.999Z");
  });

  it("fechaValida solo acepta YYYY-MM-DD reales", () => {
    expect(fechaValida("2026-10-07", "X")).toBe("2026-10-07");
    expect(fechaValida("07/10/2026", "X")).toBe("X");
    expect(fechaValida("2026-13-45", "X")).toBe("X");
    expect(fechaValida(undefined, "X")).toBe("X");
  });
});
