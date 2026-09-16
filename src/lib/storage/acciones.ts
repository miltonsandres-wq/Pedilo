"use server";

import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKETS_PERMITIDOS = ["logos", "productos"] as const;
type BucketPermitido = (typeof BUCKETS_PERMITIDOS)[number];

/**
 * Sube un archivo a Storage usando el cliente admin (service_role) en vez de
 * subirlo directo desde el navegador con el cliente normal (RLS-scoped).
 *
 * En este proyecto la subida directa desde el navegador falla de forma
 * sistemática con "new row violates row-level security policy" aunque la
 * policy en sí evalúa correctamente (confirmado a mano): el JWT de sesión no
 * se está autenticando bien contra Storage. En vez de depender de esa policy,
 * esta acción se gatea con `requireAdmin()` (igual de estricto: solo un admin
 * ya autenticado de este tenant llega hasta acá) y fuerza la ruta a empezar
 * SIEMPRE con su propio tenant_id, así que el resultado es el mismo aislamiento
 * por tenant que las policies de storage.objects querían dar.
 */
export async function subirArchivo(params: {
  bucket: BucketPermitido;
  carpeta: string; // resto de la ruta dentro del tenant, ej. "logo-123.png" o "sucursales/<id>/logo-123.png"
  formData: FormData; // debe traer un campo "archivo"
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!BUCKETS_PERMITIDOS.includes(params.bucket)) {
    return { ok: false, error: "Bucket no permitido." };
  }

  const sesion = await requireAdmin();
  const archivo = params.formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "No se recibió ningún archivo." };
  }

  const admin = createAdminClient();
  const path = `${sesion.tenant_id}/${params.carpeta}`;

  const { error } = await admin.storage.from(params.bucket).upload(path, archivo, {
    upsert: true,
    cacheControl: "3600",
    contentType: archivo.type || undefined,
  });

  if (error) return { ok: false, error: error.message };

  const { data } = admin.storage.from(params.bucket).getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}
