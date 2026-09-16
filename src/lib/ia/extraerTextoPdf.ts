import "server-only";
import { PDFParse } from "pdf-parse";

/** Texto plano de todas las páginas de un PDF (buffer ya leído en memoria). */
export async function extraerTextoPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const resultado = await parser.getText();
    return resultado.text;
  } finally {
    await parser.destroy();
  }
}
