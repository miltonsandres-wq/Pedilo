import { describe, it, expect } from "vitest";
import {
  COLUMNAS, construirFactura, construirPrecuenta, envolver, par, dinero,
  type DocumentoImprimible,
} from "@/lib/printing/documentoTexto";
import type { Instruccion } from "@/lib/printing/types";
import { calcularImpuestos } from "@/lib/fiscal/impuestos";
import { totalEnLetras } from "@/lib/fiscal/totalLetras";

const calculo = calcularImpuestos([
  { nombre: "Hamburguesa de la casa con queso extra y tocino", cantidad: 2, precioUnitario: 115, tasa: "15" },
  { nombre: "Cerveza", cantidad: 2, precioUnitario: 59, tasa: "18" },
  { nombre: "Ensalada", cantidad: 1, precioUnitario: 50, tasa: "exento" },
]);

function documento(over: Partial<DocumentoImprimible> = {}): DocumentoImprimible {
  return {
    clase: "factura", estado: "emitida", numero_completo: "001-001-01-00000123",
    cai: "A1B2C3-D4E5F6-A1B2C3-D4E5F6-A1B2C3-D4", rango_desde: 1, rango_hasta: 500,
    establecimiento: "001", punto_emision: "001", tipo_doc: "01",
    fecha_limite: "2026-12-31", fecha_emision: "2026-09-29T18:30:15Z",
    emisor_snapshot: {
      razon_social: "Inversiones Doña Rosa S. de R.L. de C.V.", nombre_comercial: "Taquería Doña Rosa",
      rtn: "08019999123456", direccion_fiscal: "Colonia Palmira, Avenida República de Panamá, Tegucigalpa",
      telefono: "2222-3333", correo: "facturas@donarosa.hn",
    },
    cliente_nombre: "Consumidor Final", cliente_rtn: null,
    no_orden_compra_exenta: null, no_constancia_exonerado: null, no_registro_sag: null,
    importe_exonerado: calculo.importeExonerado, importe_exento: calculo.importeExento,
    gravado_15: calculo.gravado15, gravado_18: calculo.gravado18, isv_15: calculo.isv15, isv_18: calculo.isv18,
    cargo_servicio: 0, total: calculo.total, total_letras: totalEnLetras(calculo.total),
    lineas: calculo.lineas.map((l) => ({ nombre: l.nombre, cantidad: l.cantidad, precio_unitario: l.precioUnitario, total: l.totalLinea })),
    ...over,
  };
}

const textos = (ins: Instruccion[]) => ins.flatMap((i) => (i.op === "texto" ? [i.texto] : []));
const idx = (ins: Instruccion[], fragmento: string) => textos(ins).findIndex((t) => t.includes(fragmento));

describe("factura de 80 mm / 48 columnas", () => {
  const ins = construirFactura(documento());

  it("ninguna línea excede el ancho (48 columnas; 24 si es texto doble)", () => {
    for (const i of ins) {
      if (i.op !== "texto") continue;
      const max = i.size === "doble" ? COLUMNAS / 2 : COLUMNAS;
      expect(i.texto.length, `«${i.texto}»`).toBeLessThanOrEqual(max);
    }
  });

  it("los bloques salen en el orden del reglamento", () => {
    const orden = [
      "Taquería Doña Rosa", "RTN: 08019999123456", "FACTURA", "No.: 001-001-01-00000123", "CAI:",
      "Fecha: 29/09/2026 12:30:15", "Cliente: Consumidor Final", "CANT", "Hamburguesa", "Cerveza",
      "Importe Exonerado:", "Importe Exento:", "Importe Gravado 15%:", "Importe Gravado 18%:", "ISV 15%:", "ISV 18%:",
      "TOTAL L.", "SON: ", "No. Orden de Compra Exenta:", "No. Constancia Registro Exonerado:", "No. Registro SAG:",
      "Rango autorizado:", "Fecha límite de emisión: 31/12/2026", "La factura es beneficio de todos", "Original: Cliente",
    ];
    const posiciones = orden.map((o) => idx(ins, o));
    expect(posiciones.every((p) => p >= 0), `faltan: ${orden.filter((_, k) => posiciones[k] < 0)}`).toBe(true);
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones);
    expect(ins[0]).toEqual({ op: "logo" });
    expect(ins.at(-1)).toEqual({ op: "cortar" });
  });

  it("nombre comercial grande y centrado; razón social, dirección, teléfono y correo debajo", () => {
    const nombre = ins.find((i) => i.op === "texto" && i.texto.includes("Taquería"));
    expect(nombre).toMatchObject({ bold: true, size: "doble", align: "center" });
    const t = textos(ins).join("\n");
    expect(t).toContain("Inversiones Doña Rosa");
    expect(t).toContain("Tel: 2222-3333");
    expect(t).toContain("facturas@donarosa.hn");
  });

  it("muestra el número, el CAI completo, el rango autorizado y la fecha límite", () => {
    const t = textos(ins);
    expect(t).toContain("A1B2C3-D4E5F6-A1B2C3-D4E5F6-A1B2C3-D4");
    expect(t).toContain("Del 001-001-01-00000001");
    expect(t).toContain("Al  001-001-01-00000500");
  });

  it("totales con dos decimales y TOTAL en negrita; total en letras", () => {
    const t = textos(ins);
    expect(t).toContain(par("Importe Gravado 15%:", "200.00")[0]);
    expect(t).toContain(par("ISV 15%:", "30.00")[0]);
    expect(t).toContain(par("Importe Exento:", "50.00")[0]);
    expect(t).toContain(par("Importe Gravado 18%:", "100.00")[0]);
    expect(t).toContain(par("ISV 18%:", "18.00")[0]);
    expect(t).toContain(par("Importe Exonerado:", "0.00")[0]);
    const total = ins.find((i) => i.op === "texto" && i.texto.startsWith("TOTAL L."));
    expect(total).toMatchObject({ bold: true });
    expect((total as { texto: string }).texto).toHaveLength(COLUMNAS);
    expect(t.join(" ")).toContain("SON: TRESCIENTOS NOVENTA Y OCHO LEMPIRAS CON 00/100");
  });

  it("imprime SIEMPRE los tres campos de exoneración, aunque estén vacíos, y los llena si existen", () => {
    expect(textos(ins)).toEqual(expect.arrayContaining(["No. Orden de Compra Exenta:", "No. Registro SAG:"]));
    const lleno = construirFactura(documento({ no_constancia_exonerado: "CE-99", no_registro_sag: "SAG-1", cliente_nombre: "Embajada", cliente_rtn: "08011999123456" }));
    const t = textos(lleno);
    expect(t).toContain("No. Registro SAG: SAG-1");
    expect(t.some((x) => x.includes("CE-99"))).toBe(true);
    expect(t).toContain("Cliente: Embajada");
    expect(t).toContain("RTN: 08011999123456");
  });

  it("las descripciones largas se parten en varias líneas sin perder texto", () => {
    const t = textos(ins);
    const i = t.findIndex((x) => x.startsWith("2    Hamburguesa de la casa con"));
    expect(i).toBeGreaterThan(-1);
    expect(t[i]).toMatch(/230\.00$/); // el total va en la primera línea
    expect(t[i + 1]).toBe("     queso extra y tocino");
  });

  it("por defecto es 'Original: Cliente'; con opción, 'Copia: Emisor'", () => {
    expect(textos(ins)).toContain("Original: Cliente");
    expect(textos(construirFactura(documento(), { copia: "emisor" }))).toContain("Copia: Emisor");
  });

  it("la reimpresión se marca y la impresión normal no", () => {
    expect(textos(ins).join("|")).not.toContain("REIMPRESIÓN");
    const re = construirFactura(documento(), { reimpresion: true });
    expect(textos(re)).toContain("*** REIMPRESIÓN ***");
    expect(idx(re, "REIMPRESIÓN")).toBeLessThan(idx(re, "No.: 001"));
  });

  it("una factura anulada se marca ANULADA", () => {
    expect(textos(construirFactura(documento({ estado: "anulada" })))).toContain("*** ANULADA ***");
  });

  it("nota de crédito: título propio y referencia a la factura original", () => {
    const nc = construirFactura(
      documento({ clase: "nota_credito", tipo_doc: "03", numero_completo: "001-001-03-00000007" }),
      { referencia: { numero_completo: "001-001-01-00000123", cai: "112233-445566-778899-AABBCC-DDEEFF-01", fecha_emision: "2026-09-28T15:00:00Z" } }
    );
    const t = textos(nc);
    expect(t).toContain("NOTA DE CRÉDITO");
    expect(t).toContain("Documento de referencia:");
    expect(t).toContain("112233-445566-778899-AABBCC-DDEEFF-01");
    expect(t).toContain("Fecha: 28/09/2026 09:00:00");
  });

  it("con cargo por servicio lo lista aparte", () => {
    const t = textos(construirFactura(documento({ cargo_servicio: 10, total: calculo.total + 10 })));
    expect(t.some((x) => x.startsWith("Cargo por servicio:"))).toBe(true);
  });
});

describe("pre-cuenta", () => {
  const ins = construirPrecuenta({
    emisor: { razon_social: "X", nombre_comercial: "Taquería Doña Rosa", rtn: null, direccion_fiscal: null, telefono: "2222-3333", correo: null },
    nombreNegocio: "Taquería Doña Rosa", mesa: "Mesa 5", numeroDia: 12, clienteNombre: "Ana",
    fecha: new Date("2026-09-29T18:30:15Z"),
    lineas: [{ nombre: "Tacos", cantidad: 3, precio_unitario: 40, total: 120 }],
    total: 120,
  });

  it("dice NO ES DOCUMENTO FISCAL y no se hace pasar por factura", () => {
    const t = textos(ins);
    expect(t.filter((x) => x === "NO ES DOCUMENTO FISCAL")).toHaveLength(2);
    expect(t).toContain("PRE-CUENTA");
    expect(t.join("|")).not.toMatch(/FACTURA|CAI|Original|Rango/);
    expect(t).toContain("Mesa: Mesa 5");
    expect(t.some((x) => x.startsWith("TOTAL A PAGAR L.") && x.endsWith("120.00"))).toBe(true);
  });

  it("cabe en 48 columnas", () => {
    for (const i of ins) if (i.op === "texto") expect(i.texto.length).toBeLessThanOrEqual(i.size === "doble" ? 24 : 48);
  });

  it("sin datos fiscales usa el nombre del negocio", () => {
    const sin = construirPrecuenta({ emisor: null, nombreNegocio: "Mi Fonda", mesa: "M1", numeroDia: null, clienteNombre: null, fecha: new Date(), lineas: [], total: 0 });
    expect(textos(sin)).toContain("Mi Fonda");
  });
});

describe("utilidades", () => {
  it("envolver no rompe palabras cortas y corta las larguísimas", () => {
    expect(envolver("uno dos tres", 7)).toEqual(["uno dos", "tres"]);
    expect(envolver("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
    expect(envolver("", 10)).toEqual([""]);
  });
  it("par alinea a la derecha y dinero da miles con coma", () => {
    expect(par("A:", "1.00")).toHaveLength(1);
    expect(par("A:", "1.00")[0]).toHaveLength(COLUMNAS);
    expect(par("Un texto larguísimo que no cabe junto al valor de la derecha", "1,000.00").every((l) => l.length <= COLUMNAS)).toBe(true);
    expect(dinero(1234.5)).toBe("1,234.50");
  });
});
