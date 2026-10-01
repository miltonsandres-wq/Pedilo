"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  procesarPedidoPublico,
  type ClienteAdminMinimo,
  type PedidoPublico,
  type ResultadoPedidoPublico,
} from "@/lib/delivery/crearPedidoPublico";

async function ipDelCliente() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "desconocida").trim();
}

/**
 * Crea el pedido desde el menú público. Aquí solo se pegan Next (headers) y el
 * cliente admin; la lógica (honeypot, rate limit, errores) está en
 * lib/delivery/crearPedidoPublico.ts y los precios los recalcula la base.
 */
export async function crearPedidoDelivery(slug: string, pedido: PedidoPublico): Promise<ResultadoPedidoPublico> {
  const admin = createAdminClient() as unknown as ClienteAdminMinimo;
  return procesarPedidoPublico(admin, slug, await ipDelCliente(), pedido);
}

const TIPOS_COMPROBANTE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Sube el comprobante de una transferencia al bucket PRIVADO. Devuelve la ruta
 * (no una URL pública): el personal lo abre con una URL firmada de corta vida.
 */
export async function subirComprobante(
  slug: string,
  formData: FormData
): Promise<{ ok: true; ruta: string } | { ok: false; error: string }> {
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, error: "No se recibió el archivo." };
  const ext = TIPOS_COMPROBANTE[archivo.type];
  if (!ext) return { ok: false, error: "Sube una foto (JPG, PNG, WEBP) o un PDF." };
  if (archivo.size > MAX_BYTES) return { ok: false, error: "El archivo pesa más de 5 MB." };

  const admin = createAdminClient();
  const { data: ok } = await admin.rpc("delivery_rate_limit_hit", {
    p_clave: `up:${await ipDelCliente()}`,
    p_max: 8,
    p_ventana_seg: 600,
  });
  if (ok === false) return { ok: false, error: "Demasiados intentos. Espera unos minutos." };

  const { data: config } = await admin.from("delivery_config").select("tenant_id, sucursal_id").eq("slug", slug).maybeSingle();
  if (!config) return { ok: false, error: "Este restaurante no existe." };

  const ruta = `${config.tenant_id}/${config.sucursal_id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await admin.storage.from("comprobantes-transferencia").upload(ruta, archivo, {
    contentType: archivo.type,
    upsert: false,
  });
  if (error) return { ok: false, error: "No se pudo subir el comprobante. Inténtalo de nuevo." };
  return { ok: true, ruta };
}
