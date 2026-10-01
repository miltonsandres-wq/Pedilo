import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Seguimiento } from "./seguimiento";

/**
 * Carga el seguimiento SOLO con el token. Token desconocido, o un slug que no
 * es el del restaurante del pedido, dan null (la página responde 404): así el
 * enlace de un restaurante no sirve para espiar pedidos de otro.
 */
export async function cargarSeguimiento(slug: string, token: string): Promise<Seguimiento | null> {
  if (!token || token.length < 20 || token.length > 100) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("seguimiento_pedido", { p_token: token });
  if (error || !data) return null;
  const s = data as unknown as Seguimiento;
  if (s.slug !== slug) return null;
  return s;
}
