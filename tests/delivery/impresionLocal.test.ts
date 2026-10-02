import { describe, it, expect } from "vitest";
import { aEscPos, bytesABase64, codificarCp858 } from "@/lib/printing/escpos";
import { ticketAHtml } from "@/lib/printing/ticketHtml";
import { ANCHO_58MM, ANCHO_80MM, COLUMNAS, conAnchoTicket, construirReciboDeliveryExterno, construirPrecuenta } from "@/lib/printing/documentoTexto";
import type { Instruccion } from "@/lib/printing/types";

const recibo = () =>
  construirReciboDeliveryExterno({
    restaurante: "Tacos María del Carmen", telefono: "2222-3333", numeroDia: 12, fecha: new Date("2030-06-15T18:30:00Z"),
    referencia: "PedidosYa #8841",
    lineas: [
      { nombre: "Tacos de carne asada con todo y piña", cantidad: 2, precio_unitario: 90, total: 180 },
      { nombre: "Limonada", cantidad: 3, precio_unitario: 50, total: 150 },
    ],
    subtotal: 330,
  });
const textos = (i: Instruccion[]) => i.flatMap((x) => (x.op === "texto" ? [x] : []));

describe("ESC/POS (impresión directa por Bluetooth, USB o RawBT)", () => {
  it("empieza inicializando la impresora y eligiendo la página de códigos de los acentos", () => {
    const b = aEscPos([{ op: "texto", texto: "Hola" }]);
    expect([...b.slice(0, 5)]).toEqual([0x1b, 0x40, 0x1b, 0x74, 19]);
  });

  it("codifica el español en CP858: acentos, ñ, ¿ y ¡", () => {
    expect(codificarCp858("áéíóú ñÑ ¿¡")).toEqual([0xa0, 0x82, 0xa1, 0xa2, 0xa3, 0x20, 0xa4, 0xa5, 0x20, 0xa8, 0xad]);
    expect(codificarCp858("L 12.50")).toEqual([...Buffer.from("L 12.50")]);
    expect(codificarCp858("≥ 😀")).toEqual([0x3f, 0x20, 0x3f]); // lo que no existe se vuelve «?»
  });

  it("negrita, tamaño doble y alineación van como comandos antes del texto, y se cierran con salto de línea", () => {
    const b = [...aEscPos([{ op: "texto", texto: "Hi", bold: true, size: "doble", align: "center" }])];
    const desde = b.indexOf(0x61, 5); // ESC a
    expect(b.slice(desde - 1, desde + 8)).toEqual([0x1b, 0x61, 1, 0x1b, 0x45, 1, 0x1d, 0x21, 0x11]);
    const i = b.indexOf(0x48); // 'H'
    expect(b.slice(i, i + 3)).toEqual([0x48, 0x69, 0x0a]);
  });

  it("raya, saltos y corte; las rayas respetan el ancho del papel", () => {
    const b80 = [...aEscPos([{ op: "linea" }], { columnas: 48 })];
    const b58 = [...aEscPos([{ op: "linea" }], { columnas: 32 })];
    expect(b80.filter((x) => x === 0x2d).length).toBe(48);
    expect(b58.filter((x) => x === 0x2d).length).toBe(32);
    const conCorte = [...aEscPos([{ op: "salto", n: 2 }, { op: "cortar" }])];
    expect(conCorte).toContain(0x56); // GS V
    expect([...aEscPos([{ op: "cortar" }], { cortar: false })]).not.toContain(0x56);
  });

  it("un recibo completo se codifica sin perder lo importante", () => {
    const b = aEscPos(recibo());
    const texto = Buffer.from(b).toString("latin1");
    expect(texto).toContain("RECIBO");
    expect(texto).toContain("SUBTOTAL L.");
    expect(texto).toContain("330.00");
    expect(b.length).toBeGreaterThan(200);
    expect(bytesABase64(b)).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});

describe("papel de 58 mm (impresoras portátiles)", () => {
  it("por omisión el ancho es el de siempre (80 mm = 48 columnas)", () => {
    expect(COLUMNAS).toBe(ANCHO_80MM);
    expect(Math.max(...textos(recibo()).map((t) => t.texto.length))).toBeLessThanOrEqual(48);
  });

  it("con 58 mm ninguna línea pasa de 32 columnas (24 en tamaño doble) y el ancho vuelve a 48 al terminar", () => {
    const instr = conAnchoTicket(ANCHO_58MM, () => recibo());
    for (const t of textos(instr)) expect(t.texto.length, t.texto).toBeLessThanOrEqual(t.size === "doble" ? 16 : 32);
    expect(COLUMNAS).toBe(ANCHO_80MM);
    // sigue teniendo todo el contenido
    const plano = textos(instr).map((t) => t.texto).join("\n");
    expect(plano).toContain("330.00");
    expect(plano).toContain("Limonada");
  });

  it("restaura el ancho aunque el armador falle", () => {
    expect(() => conAnchoTicket(ANCHO_58MM, () => { throw new Error("x"); })).toThrow("x");
    expect(COLUMNAS).toBe(ANCHO_80MM);
  });

  it("la pre-cuenta también se adapta", () => {
    const instr = conAnchoTicket(ANCHO_58MM, () =>
      construirPrecuenta({
        emisor: null, nombreNegocio: "Fondita", mesa: "Mesa 5", numeroDia: 3, clienteNombre: null, fecha: new Date(),
        lineas: [{ nombre: "Pollo con tajadas y ensalada", cantidad: 1, precio_unitario: 120, total: 120 }], total: 120,
      })
    );
    for (const t of textos(instr)) expect(t.texto.length).toBeLessThanOrEqual(t.size === "doble" ? 16 : 32);
  });
});

describe("HTML para imprimir con el navegador (PC, AirPrint, Android)", () => {
  it("documento completo con @page del ancho del papel y el contenido del ticket", () => {
    const h80 = ticketAHtml(recibo());
    expect(h80).toContain("@page { size: 80mm auto");
    expect(h80).toContain("RECIBO");
    expect(h80).toContain("NO ES DOCUMENTO FISCAL");
    expect(ticketAHtml(recibo(), { columnas: 32 })).toContain("@page { size: 58mm auto");
  });

  it("escapa el HTML: un nombre malicioso no inyecta etiquetas", () => {
    const h = ticketAHtml([{ op: "texto", texto: "<img src=x onerror=alert(1)> & \"comillas\"" }]);
    expect(h).not.toContain("<img");
    expect(h).toContain("&lt;img src=x onerror=alert(1)&gt; &amp; &quot;comillas&quot;");
  });

  it("negrita, doble y alineación se vuelven clases; «soloCuerpo» no trae el documento", () => {
    const cuerpo = ticketAHtml([{ op: "texto", texto: "A", bold: true, size: "doble", align: "center" }, { op: "linea" }], { soloCuerpo: true });
    expect(cuerpo).toContain('class="l b d c"');
    expect(cuerpo).toContain("-".repeat(48));
    expect(cuerpo).not.toContain("<html");
  });
});
