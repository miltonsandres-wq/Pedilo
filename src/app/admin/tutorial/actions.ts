"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ProgresoTutorial } from "@/lib/tutorial/pasos";

/** Marca el tutorial como completado para el negocio: no vuelve a aparecer solo. */
export async function completarTutorial(): Promise<{ ok: boolean }> {
  const sesion = await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("tenants")
    .update({ tutorial_completado_at: new Date().toISOString() })
    .eq("id", sesion.tenant_id)
    .is("tutorial_completado_at", null);

  if (error) return { ok: false };
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/**
 * Cuenta lo que el negocio ya creó, para que la guía detecte sola qué pasos
 * están hechos. Son conteos baratos (head) limitados al negocio del admin.
 */
export async function progresoTutorial(): Promise<ProgresoTutorial | null> {
  const sesion = await requireAdmin();
  const supabase = await createClient();
  const t = sesion.tenant_id;
  const contar = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);

  try {
    const [personal, categorias, productos, mesas, inventarioCategorias, inventarioItems] = await Promise.all([
      contar(supabase.from("usuarios").select("id", { count: "exact", head: true }).eq("tenant_id", t).in("rol", ["cajero", "mesero"])),
      contar(supabase.from("categorias").select("id", { count: "exact", head: true }).eq("tenant_id", t)),
      contar(supabase.from("productos").select("id", { count: "exact", head: true }).eq("tenant_id", t).eq("activo", true)),
      contar(supabase.from("mesas").select("id", { count: "exact", head: true }).eq("tenant_id", t).eq("activa", true)),
      contar(supabase.from("inventario_categorias").select("id", { count: "exact", head: true }).eq("tenant_id", t)),
      contar(supabase.from("inventario_items").select("id", { count: "exact", head: true }).eq("tenant_id", t).eq("activo", true)),
    ]);
    return { personal, categorias, productos, mesas, inventarioCategorias, inventarioItems };
  } catch {
    return null;
  }
}
