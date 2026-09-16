"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

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
