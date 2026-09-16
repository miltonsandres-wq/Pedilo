"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { extraerTextoPdf } from "@/lib/ia/extraerTextoPdf";
import { extraerMenuDeTexto, type ItemMenuExtraido } from "@/lib/ia/extraerMenu";

export interface ResultadoExtraccion {
  ok: boolean;
  items?: ItemMenuExtraido[];
  error?: string;
}

/**
 * Sube el PDF del menú y devuelve un BORRADOR (no se guarda nada todavía).
 * El admin revisa/edita/descarta filas en la pantalla de importación antes
 * de confirmar con `confirmarImportacion`.
 */
export async function extraerBorradorDeMenu(formData: FormData): Promise<ResultadoExtraccion> {
  await requireAdmin();

  const archivo = formData.get("pdf");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Selecciona un archivo PDF." };
  }
  if (archivo.type !== "application/pdf") {
    return { ok: false, error: "El archivo debe ser un PDF." };
  }

  try {
    const buffer = Buffer.from(await archivo.arrayBuffer());
    const texto = await extraerTextoPdf(buffer);

    if (!texto.trim()) {
      return { ok: false, error: "No se pudo leer texto de ese PDF (¿es una imagen escaneada?)." };
    }

    const items = await extraerMenuDeTexto(texto);
    if (items.length === 0) {
      return { ok: false, error: "No se reconoció ningún platillo en el PDF." };
    }

    return { ok: true, items };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error al procesar el PDF." };
  }
}

export interface ItemAConfirmar extends ItemMenuExtraido {
  incluir: boolean;
}

/** Guarda en el catálogo real los platillos que el admin dejó marcados. */
export async function confirmarImportacion(
  items: ItemAConfirmar[],
  sucursalIds: string[]
): Promise<{ ok: boolean; creados: number; error?: string }> {
  const sesion = await requireAdmin();
  const supabase = await createClient();

  const aIncluir = items.filter((i) => i.incluir && i.nombre.trim() && i.precio > 0);
  if (aIncluir.length === 0) return { ok: false, creados: 0, error: "No hay platillos marcados." };
  if (sucursalIds.length === 0) return { ok: false, creados: 0, error: "Selecciona al menos una sucursal." };

  // categorías: reusa las que ya existan por nombre, crea las que falten
  const { data: categoriasExistentes } = await supabase
    .from("categorias")
    .select("id, nombre")
    .eq("tenant_id", sesion.tenant_id);

  const categoriaIdPorNombre = new Map(
    (categoriasExistentes ?? []).map((c) => [c.nombre.toLowerCase(), c.id])
  );

  const nombresNuevos = [...new Set(aIncluir.map((i) => i.categoria))].filter(
    (nombre) => !categoriaIdPorNombre.has(nombre.toLowerCase())
  );

  if (nombresNuevos.length > 0) {
    const { data: nuevas } = await supabase
      .from("categorias")
      .insert(nombresNuevos.map((nombre) => ({ tenant_id: sesion.tenant_id, nombre })))
      .select("id, nombre");
    for (const c of nuevas ?? []) categoriaIdPorNombre.set(c.nombre.toLowerCase(), c.id);
  }

  let creados = 0;
  for (const item of aIncluir) {
    const categoria_id = categoriaIdPorNombre.get(item.categoria.toLowerCase()) ?? null;
    const { data: producto, error } = await supabase
      .from("productos")
      .insert({
        tenant_id: sesion.tenant_id,
        categoria_id,
        nombre: item.nombre,
        descripcion: item.descripcion,
        precio: item.precio,
      })
      .select("id")
      .single();

    if (error || !producto) continue;

    await supabase
      .from("producto_sucursales")
      .insert(sucursalIds.map((sucursal_id) => ({ producto_id: producto.id, sucursal_id })));

    creados += 1;
  }

  revalidatePath("/admin/menu");
  return { ok: true, creados };
}
