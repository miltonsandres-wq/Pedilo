"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { extraerMenuDeArchivo, type ItemMenuExtraido, type TipoArchivoMenu } from "@/lib/ia/extraerMenu";

const TIPOS: TipoArchivoMenu[] = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
/** Vercel acepta hasta 4.5 MB por petición. */
const MAX_BYTES = 4 * 1024 * 1024;

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
    return { ok: false, error: "Selecciona el PDF o la foto de tu menú." };
  }
  const tipo = TIPOS.find((t) => t === archivo.type);
  if (!tipo) return { ok: false, error: "El archivo debe ser un PDF o una foto (JPG, PNG o WebP)." };
  if (archivo.size > MAX_BYTES) {
    return { ok: false, error: "El archivo pesa más de 4 MB. Comprímelo o súbelo por partes (por ejemplo, 5 a 10 páginas a la vez)." };
  }

  try {
    const items = await extraerMenuDeArchivo(Buffer.from(await archivo.arrayBuffer()), tipo);
    if (items.length === 0) {
      return { ok: false, error: "No se reconoció ningún platillo. Prueba con otro archivo o con una foto más nítida del menú." };
    }
    return { ok: true, items };
  } catch (err) {
    console.error("[importar-menu]", err);
    const m = err instanceof Error ? err.message : "";
    if (/ANTHROPIC_API_KEY/.test(m)) return { ok: false, error: m };
    if (/timed? ?out|timeout|abort/i.test(m)) return { ok: false, error: "La lectura tardó demasiado. Prueba con un archivo más corto o más liviano." };
    if (/credit|billing|401|403|authentication|permission/i.test(m)) return { ok: false, error: "No se pudo usar la IA: revisa la clave y el saldo de ANTHROPIC_API_KEY." };
    if (/overloaded|529|rate/i.test(m)) return { ok: false, error: "La IA está ocupada. Inténtalo de nuevo en un minuto." };
    // Se deja el detalle técnico visible: así se sabe qué falló (modelo, clave, formato…) sin abrir los registros
    const status = (err as { status?: number } | null)?.status;
    const detalle = m.replace(/\s+/g, " ").slice(0, 220);
    return {
      ok: false,
      error: `No se pudo leer el menú${status ? ` (error ${status})` : ""}. ${detalle || "Inténtalo de nuevo o prueba con otro archivo."}`,
    };
  }
}

export interface ItemAConfirmar extends ItemMenuExtraido {
  incluir: boolean;
}

/** Guarda en el catálogo real los platillos que el admin dejó marcados. */
export async function confirmarImportacion(
  items: ItemAConfirmar[],
  sucursalIds: string[]
): Promise<{ ok: boolean; creados: number; omitidos?: number; fallidos?: number; detalle?: string; error?: string }> {
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

  // Si el menú ya tiene un platillo con ese nombre, no se duplica al importar de nuevo
  const { data: existentes } = await supabase
    .from("productos")
    .select("nombre")
    .eq("tenant_id", sesion.tenant_id)
    .eq("activo", true); // los eliminados no cuentan: se pueden volver a importar
  const yaExisten = new Set((existentes ?? []).map((p) => p.nombre.trim().toLowerCase()));

  let creados = 0;
  let omitidos = 0;
  let fallidos = 0;
  let primerError: string | null = null;
  for (const item of aIncluir) {
    if (yaExisten.has(item.nombre.trim().toLowerCase())) {
      omitidos += 1;
      continue;
    }
    yaExisten.add(item.nombre.trim().toLowerCase());
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

    if (error || !producto) {
      fallidos += 1;
      primerError ??= error?.message ?? "No se pudo guardar el platillo.";
      continue;
    }

    // Sin sucursal el platillo no sale en el POS ni en la carta: si no se pudo asignar, se deshace
    const { error: errSuc } = await supabase
      .from("producto_sucursales")
      .insert(sucursalIds.map((sucursal_id) => ({ producto_id: producto.id, sucursal_id })));
    if (errSuc) {
      await supabase.from("productos").delete().eq("id", producto.id);
      fallidos += 1;
      primerError ??= errSuc.message;
      continue;
    }

    creados += 1;
  }

  revalidatePath("/admin/menu");
  if (creados === 0 && fallidos > 0) {
    return { ok: false, creados, omitidos, fallidos, error: `No se pudo importar ningún platillo. ${primerError ?? ""}`.trim() };
  }
  return { ok: true, creados, omitidos, fallidos, detalle: primerError ?? undefined };
}
