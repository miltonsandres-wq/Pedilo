"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function crearMesa(formData: FormData) {
  const sesion = await requireAdmin();
  const supabase = await createClient();
  const sucursalId = String(formData.get("sucursal_id") ?? "");

  const forma = String(formData.get("forma") ?? "cuadrada");

  await supabase.from("mesas").insert({
    tenant_id: sesion.tenant_id,
    sucursal_id: sucursalId,
    nombre: String(formData.get("nombre") ?? ""),
    capacidad: Number(formData.get("capacidad") ?? 4),
    zona: String(formData.get("zona") ?? "") || null,
    forma: forma === "redonda" ? "redonda" : "cuadrada",
    pos_x: 10,
    pos_y: 10,
  });

  revalidatePath("/admin/mesas");
}

export async function actualizarMesa(id: string, formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const forma = String(formData.get("forma") ?? "cuadrada");

  await supabase
    .from("mesas")
    .update({
      nombre: String(formData.get("nombre") ?? ""),
      capacidad: Number(formData.get("capacidad") ?? 4),
      zona: String(formData.get("zona") ?? "") || null,
      forma: forma === "redonda" ? "redonda" : "cuadrada",
    })
    .eq("id", id);

  revalidatePath("/admin/mesas");
}

/** Regenera el token del QR de la mesa (invalida el link/QR impreso anterior). */
export async function regenerarQrMesa(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("mesas").update({ qr_token: crypto.randomUUID() }).eq("id", id);
  revalidatePath("/admin/mesas");
}

/** Se llama al soltar una mesa en el plano visual (drag & drop). */
export async function moverMesa(id: string, posX: number, posY: number) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("mesas").update({ pos_x: posX, pos_y: posY }).eq("id", id);
  revalidatePath("/admin/mesas");
}

export async function eliminarMesa(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("mesas").update({ activa: false }).eq("id", id);
  revalidatePath("/admin/mesas");
}
