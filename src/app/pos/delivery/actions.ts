"use server";

import { requireSucursal } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * URL firmada (2 min) del comprobante de transferencia de un pedido. La
 * lectura del pedido pasa por RLS con la sesión del personal: solo ve el
 * comprobante quien puede ver ese pedido (su sucursal / su negocio).
 */
export async function urlComprobanteTransferencia(ordenId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requireSucursal();
  const supabase = await createClient();
  const { data: pedido } = await supabase
    .from("ordenes_delivery")
    .select("comprobante_transferencia_url")
    .eq("orden_id", ordenId)
    .maybeSingle();
  const ruta = pedido?.comprobante_transferencia_url;
  if (!ruta) return { ok: false, error: "Este pedido no tiene comprobante." };

  const { data, error } = await createAdminClient().storage.from("comprobantes-transferencia").createSignedUrl(ruta, 120);
  if (error || !data) return { ok: false, error: "No se pudo abrir el comprobante." };
  return { ok: true, url: data.signedUrl };
}
