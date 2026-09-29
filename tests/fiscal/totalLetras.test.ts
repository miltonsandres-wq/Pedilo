import { describe, it, expect } from "vitest";
import { totalEnLetras, numeroALetras } from "@/lib/fiscal/totalLetras";

describe("totalEnLetras", () => {
  const casos: [number, string][] = [
    [0, "CERO LEMPIRAS CON 00/100"],
    [0.05, "CERO LEMPIRAS CON 05/100"],
    [1, "UN LEMPIRA CON 00/100"],
    [2, "DOS LEMPIRAS CON 00/100"],
    [15, "QUINCE LEMPIRAS CON 00/100"],
    [21, "VEINTIUN LEMPIRAS CON 00/100"],
    [30, "TREINTA LEMPIRAS CON 00/100"],
    [31, "TREINTA Y UN LEMPIRAS CON 00/100"],
    [100, "CIEN LEMPIRAS CON 00/100"],
    [101, "CIENTO UN LEMPIRAS CON 00/100"],
    [115, "CIENTO QUINCE LEMPIRAS CON 00/100"],
    [285.5, "DOSCIENTOS OCHENTA Y CINCO LEMPIRAS CON 50/100"],
    [999, "NOVECIENTOS NOVENTA Y NUEVE LEMPIRAS CON 00/100"],
    [1000, "MIL LEMPIRAS CON 00/100"],
    [1001, "MIL UN LEMPIRAS CON 00/100"],
    [2000, "DOS MIL LEMPIRAS CON 00/100"],
    [21000, "VEINTIUN MIL LEMPIRAS CON 00/100"],
    [100000, "CIEN MIL LEMPIRAS CON 00/100"],
    [999999.99, "NOVECIENTOS NOVENTA Y NUEVE MIL NOVECIENTOS NOVENTA Y NUEVE LEMPIRAS CON 99/100"],
    [1_000_000, "UN MILLON DE LEMPIRAS CON 00/100"],
    [1_000_001, "UN MILLON UN LEMPIRAS CON 00/100"],
    [2_500_000, "DOS MILLONES QUINIENTOS MIL LEMPIRAS CON 00/100"],
    [3_000_000, "TRES MILLONES DE LEMPIRAS CON 00/100"],
    [12.34, "DOCE LEMPIRAS CON 34/100"],
  ];
  it.each(casos)("%s -> %s", (monto, esperado) => {
    expect(totalEnLetras(monto)).toBe(esperado);
  });

  it("no se equivoca con errores de punto flotante (0.1 + 0.2)", () => {
    expect(totalEnLetras(0.1 + 0.2)).toBe("CERO LEMPIRAS CON 30/100");
    expect(totalEnLetras(1.005 * 100)).toBeTypeOf("string");
  });

  it("rechaza montos inválidos", () => {
    expect(() => totalEnLetras(-1)).toThrow();
    expect(() => totalEnLetras(Number.NaN)).toThrow();
    expect(() => numeroALetras(1.5)).toThrow();
  });
});
