"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { normalizarMensajeFlyer } from "@/lib/flyer/mensaje";

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

/** Guarda el mensaje del flyer del QR de ESTA sucursal (vacío = vuelve al mensaje por defecto). */
export async function guardarMensajeFlyer(
  sucursalId: string,
  _prev: { ok: boolean; mensaje: string } | null,
  formData: FormData
): Promise<{ ok: boolean; mensaje: string }> {
  const sesion = await requireAdmin();
  const limpio = normalizarMensajeFlyer(String(formData.get("mensaje_flyer") ?? ""));
  if (!limpio.ok) return { ok: false, mensaje: limpio.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("sucursales")
    .update({ mensaje_flyer: limpio.mensaje })
    .eq("id", sucursalId)
    .eq("tenant_id", sesion.tenant_id);
  if (error) {
    const falta = /mensaje_flyer|column|schema cache/i.test(error.message);
    return { ok: false, mensaje: falta ? "Falta aplicar la migración 0035_mensaje_flyer.sql en Supabase." : "No se pudo guardar el mensaje." };
  }
  revalidatePath("/admin/mesas");
  revalidatePath("/admin/mesas/flyer");
  return { ok: true, mensaje: limpio.mensaje ? "Mensaje guardado." : "Se usará el mensaje por defecto." };
}
