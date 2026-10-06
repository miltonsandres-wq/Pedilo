/**
 * Prepara una imagen elegida por el usuario antes de subirla. Las fotos del
 * celular pesan varios MB y la subida (acción del servidor) tiene un tope de
 * tamaño: sin esto, subir el logo o la foto de un producto desde el celular
 * fallaba. Se reduce en el navegador a un tamaño razonable y se convierte a
 * WebP/JPEG. Los SVG y los GIF se dejan tal cual (solo se revisa su peso).
 */

export const MAX_BYTES_SUBIDA = 3 * 1024 * 1024;
const TIPOS_IMAGEN = ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif", "image/heic", "image/heif"];

export class ErrorImagen extends Error {}

function aBlob(canvas: HTMLCanvasElement, tipo: string, calidad: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, tipo, calidad));
}

export async function prepararImagen(
  file: File,
  opciones: { maxLado?: number; maxBytes?: number } = {}
): Promise<File> {
  const maxLado = opciones.maxLado ?? 1024;
  const maxBytes = opciones.maxBytes ?? 1.5 * 1024 * 1024;

  if (file.type && !TIPOS_IMAGEN.includes(file.type)) {
    throw new ErrorImagen("Ese archivo no es una imagen. Usa PNG, JPG o WebP.");
  }

  // Vectoriales y animados no se pueden reescalar sin perder algo: solo se limita su peso
  if (file.type === "image/svg+xml" || file.type === "image/gif") {
    if (file.size > maxBytes) throw new ErrorImagen("La imagen pesa demasiado. Usa una de menos de 1.5 MB.");
    return file;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ErrorImagen("No se pudo leer la imagen. Prueba con una foto en formato JPG o PNG.");
  }

  const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.max(1, Math.round(bitmap.width * escala));
  const alto = Math.max(1, Math.round(bitmap.height * escala));
  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ErrorImagen("Tu navegador no pudo preparar la imagen. Prueba con otro navegador.");
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close?.();

  // WebP conserva la transparencia de los logos; si el navegador no lo soporta devuelve PNG
  let blob = await aBlob(canvas, "image/webp", 0.88);
  if (!blob || blob.type !== "image/webp") blob = await aBlob(canvas, "image/png", 1);
  for (let calidad = 0.75; blob && blob.size > maxBytes && calidad >= 0.4 && blob.type === "image/webp"; calidad -= 0.15) {
    blob = await aBlob(canvas, "image/webp", calidad);
  }
  if (!blob) throw new ErrorImagen("No se pudo preparar la imagen. Prueba con otra.");
  if (blob.size > MAX_BYTES_SUBIDA) throw new ErrorImagen("La imagen sigue pesando demasiado. Prueba con una más pequeña.");

  const base = file.name.replace(/\.[^.]+$/, "") || "imagen";
  const ext = blob.type === "image/webp" ? "webp" : "png";
  return new File([blob], `${base}.${ext}`, { type: blob.type });
}

/** Convierte cualquier fallo de la subida en un mensaje que el usuario entienda. */
export function mensajeSubida(err: unknown, porDefecto: string): string {
  const m = err instanceof Error ? err.message : "";
  if (/body exceeded|too large|413|payload/i.test(m)) return "La imagen pesa demasiado. Prueba con una más pequeña.";
  if (/bucket not found/i.test(m)) return "El almacenamiento de imágenes no está configurado. Avisa a soporte.";
  if (/failed to fetch|network|load failed/i.test(m)) return "Sin conexión. Revisa tu internet e inténtalo de nuevo.";
  // Los errores de las acciones del servidor en producción vienen con un texto genérico en inglés
  if (err instanceof Error && m && m.length < 140 && !/server components render|omitted in production/i.test(m)) return m;
  return porDefecto;
}
