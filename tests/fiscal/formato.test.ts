import { describe, it, expect } from "vitest";
import {
  esCaiValido, normalizarCai, esRtnValido, normalizarRtn, formatearNumeroDocumento,
  fechaLocalHN, formatearFecha, formatearFechaHora, dentroDeFechaLimite, diasEntre,
  validarRango, rangosTraslapan,
} from "@/lib/fiscal/formato";
import { resumirRango } from "@/lib/fiscal/alertas";

describe("CAI y RTN", () => {
  it("valida el formato del CAI y lo normaliza a mayúsculas", () => {
    expect(esCaiValido("A1B2C3-D4E5F6-A1B2C3-D4E5F6-A1B2C3-D4")).toBe(true);
    expect(esCaiValido("  a1b2c3-d4e5f6-a1b2c3-d4e5f6-a1b2c3-d4 ")).toBe(true);
    expect(normalizarCai(" a1b2c3-d4e5f6-a1b2c3-d4e5f6-a1b2c3-d4 ")).toBe("A1B2C3-D4E5F6-A1B2C3-D4E5F6-A1B2C3-D4");
    expect(esCaiValido("A1B2C3-D4E5F6-A1B2C3-D4E5F6-A1B2C3")).toBe(false); // corto
    expect(esCaiValido("G1B2C3-D4E5F6-A1B2C3-D4E5F6-A1B2C3-D4")).toBe(false); // no hex
    expect(esCaiValido("A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4")).toBe(false); // sin guiones
  });

  it("RTN: 14 dígitos, tolerando guiones y espacios", () => {
    expect(esRtnValido("08011999123456")).toBe(true);
    expect(esRtnValido("0801-1999-123456")).toBe(true);
    expect(normalizarRtn("0801-1999-123456")).toBe("08011999123456");
    expect(esRtnValido("0801199912345")).toBe(false);
    expect(esRtnValido("0801199912345A")).toBe(false);
  });
});

describe("número de documento", () => {
  it("EEE-PPP-TT-CCCCCCCC con ceros a la izquierda", () => {
    expect(formatearNumeroDocumento({ establecimiento: "000", puntoEmision: "001", tipoDoc: "01", correlativo: 1 })).toBe("000-001-01-00000001");
    expect(formatearNumeroDocumento({ establecimiento: "002", puntoEmision: "010", tipoDoc: "01", correlativo: 12345 })).toBe("002-010-01-00012345");
  });
  it("rechaza partes mal formadas o correlativos fuera de rango", () => {
    expect(() => formatearNumeroDocumento({ establecimiento: "1", puntoEmision: "001", tipoDoc: "01", correlativo: 1 })).toThrow();
    expect(() => formatearNumeroDocumento({ establecimiento: "001", puntoEmision: "001", tipoDoc: "1", correlativo: 1 })).toThrow();
    expect(() => formatearNumeroDocumento({ establecimiento: "001", puntoEmision: "001", tipoDoc: "01", correlativo: 0 })).toThrow();
    expect(() => formatearNumeroDocumento({ establecimiento: "001", puntoEmision: "001", tipoDoc: "01", correlativo: 100_000_000 })).toThrow();
  });
});

describe("fechas en hora de Honduras (UTC-6)", () => {
  it("fecha local y límite hasta el fin del día local", () => {
    expect(fechaLocalHN(new Date("2030-01-02T05:59:59Z"))).toBe("2030-01-01");
    expect(fechaLocalHN(new Date("2030-01-02T06:00:00Z"))).toBe("2030-01-02");
    expect(dentroDeFechaLimite(new Date("2030-01-02T05:59:59Z"), "2030-01-01")).toBe(true);
    expect(dentroDeFechaLimite(new Date("2030-01-02T06:00:00Z"), "2030-01-01")).toBe(false);
  });
  it("formatos de impresión", () => {
    expect(formatearFecha("2030-01-31")).toBe("31/01/2030");
    expect(formatearFechaHora(new Date("2030-01-02T05:59:07Z"))).toBe("01/01/2030 23:59:07");
  });
  it("diasEntre", () => {
    expect(diasEntre("2030-01-01", "2030-01-31")).toBe(30);
    expect(diasEntre("2030-01-31", "2030-01-01")).toBe(-30);
  });
});

describe("rangos", () => {
  it("validarRango", () => {
    expect(validarRango({ desde: 1, hasta: 500 })).toBeNull();
    expect(validarRango({ desde: 10, hasta: 5 })).toMatch(/mayor/);
    expect(validarRango({ desde: 0, hasta: 5 })).toMatch(/1/);
    expect(validarRango({ desde: 1.5, hasta: 5 })).toMatch(/enteros/);
  });
  it("traslape", () => {
    expect(rangosTraslapan({ desde: 1, hasta: 100 }, { desde: 100, hasta: 200 })).toBe(true);
    expect(rangosTraslapan({ desde: 1, hasta: 100 }, { desde: 101, hasta: 200 })).toBe(false);
    expect(rangosTraslapan({ desde: 50, hasta: 60 }, { desde: 1, hasta: 100 })).toBe(true);
  });
});

describe("resumirRango (alertas del dashboard)", () => {
  const base = { desde: 1, hasta: 100, fecha_limite: "2030-12-31", estado: "activo" };
  it("ok / consumo al 85% / vencimiento a 30 días / agotado / vencido", () => {
    expect(resumirRango({ ...base, siguiente: 10 }, "2030-01-01").nivel).toBe("ok");
    expect(resumirRango({ ...base, siguiente: 86 }, "2030-01-01")).toMatchObject({ nivel: "consumo", usados: 85, restantes: 15 });
    expect(resumirRango({ ...base, siguiente: 85 }, "2030-01-01").nivel).toBe("ok"); // 84%
    expect(resumirRango({ ...base, siguiente: 10 }, "2030-12-01").nivel).toBe("vencimiento");
    expect(resumirRango({ ...base, siguiente: 10 }, "2030-11-30").nivel).toBe("ok"); // 31 días
    expect(resumirRango({ ...base, siguiente: 101, estado: "agotado" }, "2030-01-01").nivel).toBe("agotado");
    expect(resumirRango({ ...base, siguiente: 10 }, "2031-01-01").nivel).toBe("vencido");
  });
});
