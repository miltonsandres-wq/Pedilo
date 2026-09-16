"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { FormaPago } from "@/lib/types/helpers";

export async function actualizarFormasPago(sucursalId: string, formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const activas = formData.getAll("formas") as FormaPago[];

  // Tabla de configuración simple (sin historial que preservar): se
  // reemplaza por completo en vez de upsert, así no hace falta acarrear filas
  // "inactivo=false" — su sola ausencia ya significa que no está habilitada.
  await supabase.from("formas_pago_sucursal").delete().eq("sucursal_id", sucursalId);

  if (activas.length > 0) {
    await supabase.from("formas_pago_sucursal").insert(
      activas.map((forma_pago) => ({
        sucursal_id: sucursalId,
        forma_pago,
        activo: true,
      }))
    );
  }

  revalidatePath("/admin/formas-pago");
}
