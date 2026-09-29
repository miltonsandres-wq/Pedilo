"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function crearCategoriaInventario(formData: FormData) {
  const sesion = await requireAdmin();
  const supabase = await createClient();
  await supabase.from("inventario_categorias").insert({
    tenant_id: sesion.tenant_id,
    nombre: String(formData.get("nombre") ?? ""),
  });
  revalidatePath("/admin/inventario");
}

/** Extrae del form los pares sucursal_id -> cantidad (campos "stock_<sucursalId>") y los upsertea. */
async function guardarStockPorSucursal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemId: string,
  formData: FormData
) {
  const filas = [...formData.entries()]
    .filter(([nombre]) => nombre.startsWith("stock_"))
    .map(([nombre, valor]) => ({
      item_id: itemId,
      sucursal_id: nombre.slice("stock_".length),
      cantidad: Number(valor) || 0,
    }));

  if (filas.length > 0) {
    await supabase.from("inventario_stock").upsert(filas, { onConflict: "item_id,sucursal_id" });
  }
}

export async function crearItem(formData: FormData) {
  const sesion = await requireAdmin();
  const supabase = await createClient();

  const { data: item, error } = await supabase
    .from("inventario_items")
    .insert({
      tenant_id: sesion.tenant_id,
      categoria_id: String(formData.get("categoria_id") ?? "") || null,
      nombre: String(formData.get("nombre") ?? ""),
      unidad: String(formData.get("unidad") ?? "") || "unidad",
      stock_minimo: Number(formData.get("stock_minimo") ?? 0),
      costo_unitario: String(formData.get("costo_unitario") ?? "") ? Number(formData.get("costo_unitario")) : null,
      proveedor: String(formData.get("proveedor") ?? "") || null,
    })
    .select("id")
    .single();

  if (!error && item) {
    await guardarStockPorSucursal(supabase, item.id, formData);
  }

  revalidatePath("/admin/inventario");
}

export async function actualizarItem(id: string, formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();

  await supabase
    .from("inventario_items")
    .update({
      categoria_id: String(formData.get("categoria_id") ?? "") || null,
      nombre: String(formData.get("nombre") ?? ""),
      unidad: String(formData.get("unidad") ?? "") || "unidad",
      stock_minimo: Number(formData.get("stock_minimo") ?? 0),
      costo_unitario: String(formData.get("costo_unitario") ?? "") ? Number(formData.get("costo_unitario")) : null,
      proveedor: String(formData.get("proveedor") ?? "") || null,
    })
    .eq("id", id);

  await guardarStockPorSucursal(supabase, id, formData);

  revalidatePath("/admin/inventario");
}

export async function eliminarItem(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("inventario_items").update({ activo: false }).eq("id", id);
  revalidatePath("/admin/inventario");
}
