"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const TASAS_ISV = ["exento", "15", "18"] as const;

/** ISV del producto: por defecto 15 %; bebidas alcohólicas y tabaco = 18 %. */
function tasaIsv(valor: FormDataEntryValue | null): (typeof TASAS_ISV)[number] {
  const v = String(valor ?? "");
  return (TASAS_ISV as readonly string[]).includes(v) ? (v as (typeof TASAS_ISV)[number]) : "15";
}

export async function crearCategoria(formData: FormData) {
  const sesion = await requireAdmin();
  const supabase = await createClient();
  await supabase.from("categorias").insert({
    tenant_id: sesion.tenant_id,
    nombre: String(formData.get("nombre") ?? ""),
  });
  revalidatePath("/admin/menu");
}

export async function crearProducto(formData: FormData) {
  const sesion = await requireAdmin();
  const supabase = await createClient();

  const sucursalIds = formData.getAll("sucursales").map(String);
  const categoriaId = String(formData.get("categoria_id") ?? "") || null;

  const { data: producto, error } = await supabase
    .from("productos")
    .insert({
      tenant_id: sesion.tenant_id,
      categoria_id: categoriaId,
      nombre: String(formData.get("nombre") ?? ""),
      descripcion: String(formData.get("descripcion") ?? "") || null,
      precio: Number(formData.get("precio") ?? 0),
      foto_url: String(formData.get("foto_url") ?? "") || null,
      tasa_isv: tasaIsv(formData.get("tasa_isv")),
    })
    .select("id")
    .single();

  if (!error && producto && sucursalIds.length > 0) {
    await supabase
      .from("producto_sucursales")
      .insert(sucursalIds.map((sucursal_id) => ({ producto_id: producto.id, sucursal_id })));
  }

  revalidatePath("/admin/menu");
}

export async function actualizarProducto(id: string, formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const sucursalIds = formData.getAll("sucursales").map(String);

  await supabase
    .from("productos")
    .update({
      categoria_id: String(formData.get("categoria_id") ?? "") || null,
      nombre: String(formData.get("nombre") ?? ""),
      descripcion: String(formData.get("descripcion") ?? "") || null,
      precio: Number(formData.get("precio") ?? 0),
      foto_url: String(formData.get("foto_url") ?? "") || null,
      disponible: formData.get("disponible") === "on",
      tasa_isv: tasaIsv(formData.get("tasa_isv")),
    })
    .eq("id", id);

  await supabase.from("producto_sucursales").delete().eq("producto_id", id);
  if (sucursalIds.length > 0) {
    await supabase
      .from("producto_sucursales")
      .insert(sucursalIds.map((sucursal_id) => ({ producto_id: id, sucursal_id })));
  }

  revalidatePath("/admin/menu");
}

export async function eliminarProducto(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("productos").update({ activo: false }).eq("id", id);
  revalidatePath("/admin/menu");
}
