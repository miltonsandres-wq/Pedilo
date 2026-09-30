import { db } from "@/lib/offline/db";

/**
 * Logo para la térmica. Las impresoras ESC/POS solo entienden puntos en blanco
 * y negro, así que el navegador (que sí decodifica PNG/JPG/WebP/SVG) lo
 * convierte a un PNG de 1 bit y lo cachea en Dexie; el agente de impresión no
 * necesita librerías de imagen.
 */

const CLAVE_LOGO = "logo_impresion";
/** Puntos de ancho: la mitad de un rollo de 80 mm (576 puntos) — nítido y rápido de imprimir. */
const ANCHO_MAX = 384;
const ALTO_MAX = 160;
const UMBRAL_NEGRO = 170;

interface LogoCacheado {
  url: string;
  png: string | null;
}

function cargarImagen(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("No se pudo decodificar el logo"));
    };
    img.src = objectUrl;
  });
}

/** Descarga y convierte el logo a PNG blanco/negro en base64 (sin prefijo data:). null si no se puede. */
export async function rasterizarLogo(url: string): Promise<string | null> {
  if (typeof document === "undefined") return null;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const img = await cargarImagen(await res.blob());

    const escala = Math.min(ANCHO_MAX / img.naturalWidth, ALTO_MAX / img.naturalHeight, 1);
    // Múltiplo de 8 de ancho: la impresora manda 8 puntos por byte
    const ancho = Math.max(8, Math.round((img.naturalWidth * escala) / 8) * 8);
    const alto = Math.max(1, Math.round(img.naturalHeight * escala));

    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(img, 0, 0, ancho, alto);

    const datos = ctx.getImageData(0, 0, ancho, alto);
    const px = datos.data;
    for (let i = 0; i < px.length; i += 4) {
      const luminancia = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      const negro = px[i + 3] > 127 && luminancia < UMBRAL_NEGRO;
      px[i] = px[i + 1] = px[i + 2] = negro ? 0 : 255;
      px[i + 3] = 255;
    }
    ctx.putImageData(datos, 0, 0);
    return canvas.toDataURL("image/png").split(",")[1] ?? null;
  } catch {
    return null;
  }
}

/** Prepara (y cachea) el logo. Se llama al sincronizar; nunca lanza. */
export async function precargarLogoImpresion(url: string | null | undefined): Promise<void> {
  try {
    if (!url) {
      await db.config.delete(CLAVE_LOGO);
      return;
    }
    const previo = (await db.config.get(CLAVE_LOGO))?.valor as LogoCacheado | undefined;
    if (previo?.url === url && previo.png) return;
    const png = await rasterizarLogo(url);
    await db.config.put({ clave: CLAVE_LOGO, valor: { url, png } satisfies LogoCacheado });
  } catch {
    /* sin logo el ticket sale igual */
  }
}

/** El PNG ya preparado, o null (imprime sin logo en vez de fallar). */
export async function logoImpresionCacheado(): Promise<string | null> {
  const c = (await db.config.get(CLAVE_LOGO))?.valor as LogoCacheado | undefined;
  return c?.png ?? null;
}
