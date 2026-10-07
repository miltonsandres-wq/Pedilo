import "server-only";
import sharp from "sharp";

/**
 * Descarga el logo del negocio y lo deja como PNG (cualquier formato: WebP, JPG, SVG…) para ponerlo de
 * marca de agua en el PDF de la factura. Nunca lanza: sin logo (o si falla) la factura sale igual.
 */
export async function logoFondoParaPdf(url: string | null | undefined): Promise<Uint8Array | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4_000) });
    if (!res.ok) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > 5 * 1024 * 1024) return null;
    const png = await sharp(bytes).resize({ width: 600, height: 600, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    return new Uint8Array(png);
  } catch {
    return null;
  }
}
