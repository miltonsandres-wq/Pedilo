import { describe, it, expect } from "vitest";
import { separarCierre } from "@/lib/reportes/separarCierre";

const pago = (orden_id: string, forma_pago: string, monto: number) => ({ orden_id, forma_pago, monto });

describe("cierre separado: facturado / no facturado", () => {
  const pagos = [
    pago("1", "efectivo", 115), // factura vigente
    pago("2", "tarjeta", 230), // factura vigente
    pago("3", "efectivo", 60), // ticket sin factura
    pago("4", "transferencia", 80), // ticket sin factura
    pago("5", "efectivo", 40), // factura anulada
  ];
  const facturas = new Map<string, "emitida" | "anulada">([
    ["1", "emitida"],
    ["2", "emitida"],
    ["5", "anulada"],
  ]);

  it("separa lo facturado de lo no facturado, cada uno por método de pago", () => {
    const c = separarCierre(pagos, facturas);
    expect(c.facturado).toEqual({ cantidad: 2, total: 345, porFormaPago: { efectivo: 115, tarjeta: 230 } });
    expect(c.noFacturado).toEqual({ cantidad: 2, total: 140, porFormaPago: { efectivo: 60, transferencia: 80 } });
  });

  it("lo anulado va aparte y no suma a lo facturado", () => {
    const c = separarCierre(pagos, facturas);
    expect(c.anulado).toEqual({ cantidad: 1, total: 40, porFormaPago: { efectivo: 40 } });
  });

  it("un ticket cuya anulación aprobó el admin también pasa a anulado", () => {
    const c = separarCierre(pagos, facturas, new Set(["4"]));
    expect(c.noFacturado.total).toBe(60);
    expect(c.anulado).toMatchObject({ cantidad: 2, total: 120 });
  });

  it("cuadra con el total cobrado, método por método", () => {
    const c = separarCierre(pagos, facturas, new Set(["4"]));
    expect(c.cuadra).toBe(true);
    const efectivo = c.facturado.porFormaPago.efectivo + c.noFacturado.porFormaPago.efectivo + c.anulado.porFormaPago.efectivo;
    expect(efectivo).toBe(215);
  });

  it("una orden con varios pagos (mixto) cuenta como una sola orden", () => {
    const c = separarCierre([pago("1", "efectivo", 50), pago("1", "tarjeta", 65)], new Map([["1", "emitida"]]));
    expect(c.facturado).toEqual({ cantidad: 1, total: 115, porFormaPago: { efectivo: 50, tarjeta: 65 } });
  });

  it("sin pagos todo en cero y cuadra", () => {
    const c = separarCierre([], new Map());
    expect(c.facturado.total + c.noFacturado.total + c.anulado.total).toBe(0);
    expect(c.cuadra).toBe(true);
  });

  it("no pierde centavos con decimales", () => {
    const c = separarCierre([pago("1", "efectivo", 0.1), pago("2", "efectivo", 0.2)], new Map([["1", "emitida"]]));
    expect(c.facturado.total + c.noFacturado.total).toBeCloseTo(0.3, 10);
    expect(c.cuadra).toBe(true);
  });
});
