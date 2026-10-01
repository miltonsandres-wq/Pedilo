import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { COLUMNAS } from "./documentoTexto";
import type { Instruccion } from "./types";

/**
 * Convierte las instrucciones de un ticket de 80 mm (las mismas que recibe la
 * impresora) en un PDF del mismo ancho, en una sola página. Así la factura que
 * descarga el cliente es idéntica a la impresa. Courier es monoespaciada: 48
 * columnas caben exactas.
 */

const ANCHO_PT = 226.77; // 80 mm
const MARGEN = 8;
const TAM = (ANCHO_PT - 2 * MARGEN) / (COLUMNAS * 0.6); // Courier: cada carácter mide 0.6 × tamaño
const INTERLINEADO = 1.25;

/** Courier (WinAnsi) no codifica todo Unicode: lo que no entra se cambia por "?". */
function seguro(texto: string, fuente: PDFFont): string {
  let salida = "";
  for (const ch of texto) {
    try {
      fuente.encodeText(ch);
      salida += ch;
    } catch {
      salida += "?";
    }
  }
  return salida;
}

export async function instruccionesAPdf(instrucciones: Instruccion[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Courier);
  const negrita = await doc.embedFont(StandardFonts.CourierBold);

  // Primero se miden las líneas para fijar el alto de la página
  type Linea = { texto: string; align: "left" | "center" | "right"; bold: boolean; escala: number };
  const lineas: (Linea | { vacio: number })[] = [];
  for (const ins of instrucciones) {
    if (ins.op === "texto") {
      lineas.push({ texto: ins.texto, align: ins.align ?? "left", bold: !!ins.bold, escala: ins.size === "doble" ? 2 : 1 });
    } else if (ins.op === "linea") {
      lineas.push({ texto: "-".repeat(COLUMNAS), align: "left", bold: false, escala: 1 });
    } else if (ins.op === "salto") {
      lineas.push({ vacio: ins.n ?? 1 });
    }
    // logo y cortar no aplican en PDF
  }

  const alto = (l: Linea | { vacio: number }) => ("vacio" in l ? l.vacio : l.escala) * TAM * INTERLINEADO;
  const altoTotal = lineas.reduce((acc, l) => acc + alto(l), 0) + 2 * MARGEN;
  const pagina = doc.addPage([ANCHO_PT, Math.max(altoTotal, 120)]);

  let y = pagina.getHeight() - MARGEN;
  for (const l of lineas) {
    const h = alto(l);
    if ("vacio" in l) {
      y -= h;
      continue;
    }
    const fuente = l.bold ? negrita : normal;
    const tam = TAM * l.escala;
    const texto = seguro(l.texto, fuente);
    const ancho = fuente.widthOfTextAtSize(texto, tam);
    const x =
      l.align === "center" ? (ANCHO_PT - ancho) / 2 : l.align === "right" ? ANCHO_PT - MARGEN - ancho : MARGEN;
    pagina.drawText(texto, { x, y: y - tam, size: tam, font: fuente, color: rgb(0, 0, 0) });
    y -= h;
  }
  return doc.save();
}
