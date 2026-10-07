import "server-only";
import QRCode from "qrcode";

export { obtenerOrigen } from "./url";

export function urlCartaMesa(origen: string, qrToken: string) {
  return `${origen}/carta/${qrToken}`;
}

/** PNG como data URI, listo para <img src=...> — se genera en el servidor. */
export async function qrComoDataUrl(texto: string) {
  return QRCode.toDataURL(texto, { margin: 1, width: 240, color: { dark: "#14171e" } });
}

/** QR en alta resolución para IMPRIMIR (el de 240 px se ve borroso en papel). */
export async function qrParaImprimir(texto: string) {
  return QRCode.toDataURL(texto, { margin: 1, width: 900, errorCorrectionLevel: "M", color: { dark: "#14171e" } });
}
