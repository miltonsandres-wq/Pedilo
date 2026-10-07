import type { Instruccion } from "./types";

const escapar = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Ticket como HTML de papel continuo (80 o 58 mm) para imprimir con el diálogo
 * del sistema (`window.print`): sirve con cualquier impresora que el
 * dispositivo ya tenga instalada (USB en Windows/Mac, AirPrint en iPhone/iPad,
 * servicio de impresión de Android). Función pura.
 *
 * `soloCuerpo` devuelve solo el contenido (para la vista previa en pantalla,
 * que lleva su propio estilo); si no, devuelve un documento completo con
 * @page ajustado al ancho del papel.
 */
export function ticketAHtml(instrucciones: Instruccion[], opciones: { columnas?: number; soloCuerpo?: boolean; logoFondoUrl?: string | null } = {}): string {
  const columnas = opciones.columnas ?? 48;
  const lineas: string[] = [];

  for (const ins of instrucciones) {
    if (ins.op === "texto") {
      const clases = ["l"];
      if (ins.bold) clases.push("b");
      if (ins.size === "doble") clases.push("d");
      clases.push(ins.align === "center" ? "c" : ins.align === "right" ? "r" : "i");
      lineas.push(`<div class="${clases.join(" ")}">${escapar(ins.texto) || "&nbsp;"}</div>`);
    } else if (ins.op === "linea") {
      lineas.push(`<div class="l i">${"-".repeat(columnas)}</div>`);
    } else if (ins.op === "salto") {
      for (let i = 0; i < Math.min(ins.n ?? 1, 3); i++) lineas.push(`<div class="l">&nbsp;</div>`);
    }
    // logo y cortar no se dibujan
  }
  const cuerpo = lineas.join("\n");
  if (opciones.soloCuerpo) return cuerpo;

  // Courier mide 0.6 em por carácter: el tamaño se calcula para que quepan `columnas` en el papel
  const anchoMm = columnas <= 32 ? 58 : 80;
  const tamMm = ((anchoMm - 6) / (columnas * 0.6)).toFixed(3);
  // Logo del negocio como marca de agua de fondo (suave, para que no estorbe al texto). Solo http(s).
  const fondo = opciones.logoFondoUrl && /^https?:\/\//i.test(opciones.logoFondoUrl)
    ? `<img class="fondo" alt="" src="${escapar(opciones.logoFondoUrl)}">`
    : "";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ticket</title><style>
@page { size: ${anchoMm}mm auto; margin: 0 }
html, body { margin: 0; padding: 0; background: #fff }
body { width: ${anchoMm}mm; padding: 2mm 3mm; box-sizing: border-box; font-family: "Courier New", Courier, monospace; font-size: ${tamMm}mm; line-height: 1.25; color: #000 }
.l { white-space: pre; overflow: hidden }
.b { font-weight: 700 }
.d { font-size: ${(Number(tamMm) * 2).toFixed(3)}mm; line-height: 1.1 }
${fondo ? `.fondo { position: fixed; left: 50%; top: 50%; width: 62%; max-height: 70%; object-fit: contain; transform: translate(-50%, -50%); opacity: .13; z-index: -1 }
` : ""}.c { text-align: center } .r { text-align: right } .i { text-align: left }
</style></head><body>
${fondo}
${cuerpo}
</body></html>`;
}
