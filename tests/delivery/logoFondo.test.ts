import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { ticketAHtml } from "@/lib/printing/ticketHtml";
import { instruccionesAPdf } from "@/lib/printing/ticketPdf";
import type { Instruccion } from "@/lib/printing/types";

const ticket: Instruccion[] = [{ op: "texto", texto: "FACTURA", bold: true, align: "center" }, { op: "linea" }];

// PNG de 1x1 píxel
const PNG_1X1 = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64")
);

describe("logo del negocio de fondo en la factura impresa por el navegador", () => {
  it("sin logo no agrega nada", () => {
    const h = ticketAHtml(ticket);
    expect(h).not.toContain("class=\"fondo\"");
    expect(h).not.toContain(".fondo {");
  });

  it("con logo lo pone de marca de agua detrás del texto", () => {
    const h = ticketAHtml(ticket, { logoFondoUrl: "https://x.supabase.co/storage/v1/object/public/logos/t/logo.webp" });
    expect(h).toContain('<img class="fondo" alt="" src="https://x.supabase.co/storage/v1/object/public/logos/t/logo.webp">');
    expect(h).toContain("opacity: .13");
    expect(h).toContain("z-index: -1");
    expect(h.indexOf("class=\"fondo\"")).toBeLessThan(h.indexOf("FACTURA")); // va antes: queda detrás
  });

  it("solo acepta http(s) y escapa la URL", () => {
    expect(ticketAHtml(ticket, { logoFondoUrl: "javascript:alert(1)" })).not.toContain("class=\"fondo\"");
    const h = ticketAHtml(ticket, { logoFondoUrl: 'https://x.test/a"onerror="alert(1)' });
    expect(h).not.toContain('src="https://x.test/a"onerror');
    expect(h).toContain("&quot;");
  });
});

describe("logo del negocio de fondo en el PDF de la factura", () => {
  it("genera el PDF con y sin logo, y el que lleva logo trae una imagen embebida", async () => {
    const sin = await instruccionesAPdf(ticket);
    const con = await instruccionesAPdf(ticket, { logoFondoPng: PNG_1X1 });
    expect(new TextDecoder().decode(sin.slice(0, 5))).toBe("%PDF-");
    expect(new TextDecoder().decode(con.slice(0, 5))).toBe("%PDF-");
    expect(con.length).toBeGreaterThan(sin.length);
    expect((await PDFDocument.load(con)).getPageCount()).toBe(1);
  });

  it("si el logo viene dañado, la factura sale igual", async () => {
    const pdf = await instruccionesAPdf(ticket, { logoFondoPng: Uint8Array.from([1, 2, 3]) });
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
  });
});
