export interface ItemMenuExtraido {
  categoria: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
}

/**
 * Limpia lo que devuelve la IA: descarta filas sin nombre, pone «General» si falta
 * la categoría, convierte precios escritos como texto («L. 1,250.50», «85,00») y
 * quita platillos repetidos (mismo nombre y categoría).
 */
export function normalizarItemsMenu(crudo: unknown): ItemMenuExtraido[] {
  if (!Array.isArray(crudo)) return [];
  const vistos = new Set<string>();
  const salida: ItemMenuExtraido[] = [];

  for (const i of crudo) {
    if (typeof i !== "object" || i === null) continue;
    const fila = i as Record<string, unknown>;
    const nombre = typeof fila.nombre === "string" ? fila.nombre.trim() : "";
    if (!nombre) continue;
    const categoria = typeof fila.categoria === "string" && fila.categoria.trim() ? fila.categoria.trim() : "General";

    const clave = `${categoria.toLowerCase()}|${nombre.toLowerCase()}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);

    salida.push({
      categoria,
      nombre,
      descripcion: typeof fila.descripcion === "string" && fila.descripcion.trim() ? fila.descripcion.trim() : null,
      precio: aPrecio(fila.precio),
    });
  }
  return salida;
}

function aPrecio(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0;
  if (typeof v !== "string") return 0;
  // Se quita el símbolo («L.», «$») y cualquier otra cosa que no sea número o separador
  let t = v.replace(/[^\d.,]/g, "").replace(/^[.,]+|[.,]+$/g, "");
  const ultimaComa = t.lastIndexOf(",");
  const ultimoPunto = t.lastIndexOf(".");
  if (ultimaComa >= 0 && ultimoPunto >= 0) {
    // «1,250.50» o «1.250,50»: el último separador es el decimal, el otro son miles
    const decimal = ultimaComa > ultimoPunto ? "," : ".";
    t = t.split(decimal === "," ? "." : ",").join("").replace(decimal, ".");
  } else if (ultimaComa >= 0) {
    // «85,50» es decimal; «1,250» son miles
    t = /,\d{1,2}$/.test(t) ? t.replace(",", ".") : t.replace(/,/g, "");
  }
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}
