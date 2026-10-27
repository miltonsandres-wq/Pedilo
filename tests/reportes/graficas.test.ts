import { describe, it, expect } from "vitest";
import {
  SIN_CATEGORIA, etiquetaHora, filasFormaPago, horaHN, horasContinuas, ventasPorCategoria, ventasPorHora,
} from "@/lib/reportes/graficas";
import { ETIQUETA_URGENCIA, minutosDesde, nivelUrgencia } from "@/lib/cocina/urgencia";

describe("ventasPorHora", () => {
  it("la hora es la de Honduras (UTC-6): 18:30Z = 12:30 y 02:00Z = 20:00 del día anterior", () => {
    expect(horaHN("2026-09-29T18:30:00Z")).toBe(12);
    expect(horaHN("2026-09-30T02:00:00Z")).toBe(20);
    expect(horaHN("2026-09-29T06:00:00Z")).toBe(0);
  });

  it("suma por hora y ordena; solo trae las horas con ventas", () => {
    const r = ventasPorHora([
      { monto: 100, created_at: "2026-09-29T19:10:00Z" }, // 13h
      { monto: 50.5, created_at: "2026-09-29T19:50:00Z" }, // 13h
      { monto: 200, created_at: "2026-09-29T14:00:00Z" }, // 08h
    ]);
    expect(r).toEqual([{ hora: 8, total: 200 }, { hora: 13, total: 150.5 }]);
    expect(ventasPorHora([])).toEqual([]);
  });

  it("horasContinuas rellena los huecos con cero y garantiza un mínimo de horas", () => {
    const r = horasContinuas([{ hora: 12, total: 10 }, { hora: 15, total: 5 }], 4);
    expect(r).toEqual([{ hora: 12, total: 10 }, { hora: 13, total: 0 }, { hora: 14, total: 0 }, { hora: 15, total: 5 }]);
    const corto = horasContinuas([{ hora: 12, total: 10 }], 8);
    expect(corto).toHaveLength(8);
    expect(corto.map((d) => d.hora)).toContain(12);
    expect(horasContinuas([])).toEqual([]);
    expect(etiquetaHora(7)).toBe("07:00");
  });
});

describe("ventasPorCategoria", () => {
  const catDe = new Map<string, string | null>([["P1", "C1"], ["P2", "C1"], ["P3", "C2"], ["P4", null]]);
  const nombres = new Map([["C1", "Platos fuertes"], ["C2", "Bebidas"]]);

  it("suma cantidad × precio por categoría y ordena de mayor a menor", () => {
    const r = ventasPorCategoria(
      [
        { producto_id: "P1", cantidad: 2, precio_unitario: 100 },
        { producto_id: "P2", cantidad: 1, precio_unitario: 50 },
        { producto_id: "P3", cantidad: 4, precio_unitario: 30 },
      ],
      catDe,
      nombres
    );
    expect(r).toEqual([{ nombre: "Platos fuertes", total: 250 }, { nombre: "Bebidas", total: 120 }]);
  });

  it("lo sin categoría, borrado o sin producto va a «Sin categoría»", () => {
    const r = ventasPorCategoria(
      [
        { producto_id: "P4", cantidad: 1, precio_unitario: 10 },
        { producto_id: "NOEXISTE", cantidad: 1, precio_unitario: 5 },
        { producto_id: null, cantidad: 2, precio_unitario: 1 },
      ],
      catDe,
      nombres
    );
    expect(r).toEqual([{ nombre: SIN_CATEGORIA, total: 17 }]);
  });
});

describe("filasFormaPago", () => {
  it("ordena de mayor a menor y deja el nombre legible", () => {
    expect(filasFormaPago({ efectivo: 100, delivery_externo: 300, tarjeta: 200 })).toEqual([
      { nombre: "delivery externo", total: 300 },
      { nombre: "tarjeta", total: 200 },
      { nombre: "efectivo", total: 100 },
    ]);
  });
});

describe("urgencia de cocina", () => {
  const ahora = Date.parse("2026-09-29T18:00:00Z");
  it("cuenta los minutos desde enviada_at (0 si no hay fecha o es futura)", () => {
    expect(minutosDesde("2026-09-29T17:54:30Z", ahora)).toBe(5);
    expect(minutosDesde(null, ahora)).toBe(0);
    expect(minutosDesde("2026-09-29T18:10:00Z", ahora)).toBe(0);
  });
  it("verde menos de 5 min, ámbar de 5 a 9, rojo desde 10", () => {
    expect(nivelUrgencia(0)).toBe("fresco");
    expect(nivelUrgencia(4)).toBe("fresco");
    expect(nivelUrgencia(5)).toBe("atencion");
    expect(nivelUrgencia(9)).toBe("atencion");
    expect(nivelUrgencia(10)).toBe("critico");
    expect(ETIQUETA_URGENCIA.critico).toBe("¡Urgente!");
  });
});
