import { describe, it, expect } from "vitest";
import { calcularImpuestos, type LineaFiscal } from "@/lib/fiscal/impuestos";

const cent = (n: number) => Math.round(n * 100);

describe("calcularImpuestos", () => {
  it("un precio con ISV incluido se separa en base + ISV que suman lo cobrado", () => {
    const r = calcularImpuestos([{ nombre: "Pizza", cantidad: 1, precioUnitario: 115, tasa: "15" }]);
    expect(r).toMatchObject({ gravado15: 100, isv15: 15, total: 115 });
  });

  it("18% (alcohol/tabaco)", () => {
    const r = calcularImpuestos([{ nombre: "Cerveza", cantidad: 1, precioUnitario: 118, tasa: "18" }]);
    expect(r).toMatchObject({ gravado18: 100, isv18: 18, gravado15: 0, isv15: 0, total: 118 });
  });

  it("el redondeo de la base queda en centavos y el ISV es el resto (base + ISV = total exacto)", () => {
    // 100 / 1.15 = 86.9565... -> base 86.96 (half-up), isv 13.04
    const r = calcularImpuestos([{ nombre: "X", cantidad: 1, precioUnitario: 100, tasa: "15" }]);
    expect(r.gravado15).toBe(86.96);
    expect(r.isv15).toBe(13.04);
    expect(cent(r.gravado15) + cent(r.isv15)).toBe(10000);
  });

  it("ISV mixto (15% + 18% + exento) sin descuento", () => {
    const r = calcularImpuestos([
      { nombre: "Hamburguesa", cantidad: 2, precioUnitario: 115, tasa: "15" },
      { nombre: "Cerveza", cantidad: 2, precioUnitario: 59, tasa: "18" },
      { nombre: "Ensalada", cantidad: 1, precioUnitario: 50, tasa: "exento" },
    ]);
    expect(r).toMatchObject({
      importeExento: 50, gravado15: 200, isv15: 30, gravado18: 100, isv18: 18, importeExonerado: 0, total: 398,
    });
  });

  it("ISV mixto con descuento prorrateado ANTES de calcular la base", () => {
    const r = calcularImpuestos(
      [
        { nombre: "Hamburguesa", cantidad: 2, precioUnitario: 115, tasa: "15" },
        { nombre: "Cerveza", cantidad: 2, precioUnitario: 59, tasa: "18" },
        { nombre: "Ensalada", cantidad: 1, precioUnitario: 50, tasa: "exento" },
      ],
      { descuento: 39.8 }
    );
    expect(r).toMatchObject({
      importeExento: 45, gravado15: 180, isv15: 27, gravado18: 90, isv18: 16.2, total: 358.2,
    });
    expect(r.lineas.map((l) => l.totalLinea)).toEqual([207, 106.2, 45]);
  });

  it("el descuento prorrateado suma EXACTO aunque no se reparta parejo", () => {
    const lineas: LineaFiscal[] = [
      { nombre: "A", cantidad: 1, precioUnitario: 33.33, tasa: "15" },
      { nombre: "B", cantidad: 1, precioUnitario: 33.33, tasa: "15" },
      { nombre: "C", cantidad: 1, precioUnitario: 33.34, tasa: "15" },
    ];
    const r = calcularImpuestos(lineas, { descuento: 0.05 });
    expect(r.total).toBe(99.95);
    expect(cent(r.lineas.reduce((a, l) => a + l.totalLinea, 0))).toBe(9995);
  });

  it("exoneración: todo va a importe exonerado con ISV 0", () => {
    const r = calcularImpuestos(
      [
        { nombre: "Hamburguesa", cantidad: 1, precioUnitario: 115, tasa: "15" },
        { nombre: "Cerveza", cantidad: 1, precioUnitario: 118, tasa: "18" },
        { nombre: "Ensalada", cantidad: 1, precioUnitario: 50, tasa: "exento" },
      ],
      { exonerado: true }
    );
    expect(r).toMatchObject({
      importeExonerado: 283, importeExento: 0, gravado15: 0, gravado18: 0, isv15: 0, isv18: 0, total: 283,
    });
  });

  it("el cargo por servicio va fuera de la base gravable y suma al total", () => {
    const r = calcularImpuestos([{ nombre: "Pizza", cantidad: 1, precioUnitario: 115, tasa: "15" }], {
      cargoServicio: 11.5,
    });
    expect(r).toMatchObject({ gravado15: 100, isv15: 15, cargoServicio: 11.5, total: 126.5 });
  });

  it("valida entradas inválidas", () => {
    expect(() => calcularImpuestos([])).toThrow();
    expect(() => calcularImpuestos([{ nombre: "X", cantidad: 0, precioUnitario: 10, tasa: "15" }])).toThrow();
    expect(() => calcularImpuestos([{ nombre: "X", cantidad: 1, precioUnitario: 10, tasa: "12" as never }])).toThrow();
    expect(() =>
      calcularImpuestos([{ nombre: "X", cantidad: 1, precioUnitario: 10, tasa: "15" }], { descuento: 11 })
    ).toThrow();
  });

  it("propiedad: para cualquier combinación, base + ISV + exento + exonerado + cargo = total y cada grupo cuadra con lo cobrado", () => {
    let semilla = 42;
    const azar = () => {
      semilla = (semilla * 1664525 + 1013904223) % 4294967296;
      return semilla / 4294967296;
    };
    const tasas = ["exento", "15", "18"] as const;

    for (let i = 0; i < 500; i++) {
      const n = 1 + Math.floor(azar() * 6);
      const lineas: LineaFiscal[] = Array.from({ length: n }, (_, k) => ({
        nombre: `L${k}`,
        cantidad: 1 + Math.floor(azar() * 5),
        precioUnitario: Math.round(azar() * 50000) / 100,
        tasa: tasas[Math.floor(azar() * 3)],
      }));
      const bruto = lineas.reduce((a, l) => a + cent(l.precioUnitario) * l.cantidad, 0);
      const descuento = azar() < 0.5 ? Math.floor(azar() * bruto) / 100 : 0;
      const cargo = azar() < 0.3 ? Math.round(azar() * 5000) / 100 : 0;
      const exonerado = azar() < 0.2;

      const r = calcularImpuestos(lineas, { descuento, cargoServicio: cargo, exonerado });

      const suma =
        cent(r.importeExonerado) + cent(r.importeExento) + cent(r.gravado15) + cent(r.gravado18) +
        cent(r.isv15) + cent(r.isv18) + cent(r.cargoServicio);
      expect(suma).toBe(cent(r.total));
      // lo cobrado por las líneas (neto de descuento) + cargo = total
      expect(cent(r.lineas.reduce((a, l) => a + l.totalLinea, 0)) + cent(cargo)).toBe(cent(r.total));
      expect(bruto - cent(descuento)).toBe(cent(r.lineas.reduce((a, l) => a + l.totalLinea, 0)));
    }
  });
});
