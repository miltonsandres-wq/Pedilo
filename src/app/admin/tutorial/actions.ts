"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

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
