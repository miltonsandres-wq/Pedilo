/**
 * Agregaciones puras para las gráficas del reporte (sin base de datos): el cierre diario trae
 * los pagos y los ítems del día y aquí se convierten en lo que dibujan las gráficas.
 */

export interface VentaPorHora {
  /** Hora local de Honduras, 0-23. */
  hora: number;
  total: number;
}

export interface VentaPorCategoria {
  nombre: string;
  total: number;
}

const OFFSET_HN_HORAS = -6;

/** Hora local de Honduras (0-23) de un instante ISO. Honduras es UTC-6 fijo. */
export function horaHN(iso: string): number {
  const utc = new Date(iso).getUTCHours();
  return (((utc + OFFSET_HN_HORAS) % 24) + 24) % 24;
}

/** Suma lo cobrado por hora del día (hora de Honduras). Devuelve solo las horas con ventas, en orden. */
export function ventasPorHora(pagos: { monto: number; created_at: string }[]): VentaPorHora[] {
  const porHora = new Map<number, number>();
  for (const p of pagos) {
    const h = horaHN(p.created_at);
    porHora.set(h, (porHora.get(h) ?? 0) + Number(p.monto));
  }
  return [...porHora.entries()]
    .map(([hora, total]) => ({ hora, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => a.hora - b.hora);
}

/**
 * Rellena con ceros las horas sin ventas entre la primera y la última (mínimo `minimo` horas seguidas),
 * para que el eje del tiempo sea continuo y no engañe con huecos.
 */
export function horasContinuas(datos: VentaPorHora[], minimo = 8): VentaPorHora[] {
  if (datos.length === 0) return [];
  let desde = datos[0].hora;
  let hasta = datos[datos.length - 1].hora;
  while (hasta - desde + 1 < minimo) {
    if (desde > 0) desde--;
    if (hasta - desde + 1 < minimo && hasta < 23) hasta++;
    if (desde === 0 && hasta === 23) break;
  }
  const porHora = new Map(datos.map((d) => [d.hora, d.total]));
  return Array.from({ length: hasta - desde + 1 }, (_, i) => ({ hora: desde + i, total: porHora.get(desde + i) ?? 0 }));
}

export const SIN_CATEGORIA = "Sin categoría";

/** Suma lo vendido (cantidad × precio) por categoría. Los productos sin categoría van a «Sin categoría». */
export function ventasPorCategoria(
  items: { producto_id: string | null; cantidad: number; precio_unitario: number }[],
  categoriaDeProducto: Map<string, string | null>,
  nombreCategoria: Map<string, string>
): VentaPorCategoria[] {
  const acumulado = new Map<string, number>();
  for (const i of items) {
    const catId = i.producto_id ? (categoriaDeProducto.get(i.producto_id) ?? null) : null;
    const nombre = (catId && nombreCategoria.get(catId)) || SIN_CATEGORIA;
    acumulado.set(nombre, (acumulado.get(nombre) ?? 0) + i.cantidad * Number(i.precio_unitario));
  }
  return [...acumulado.entries()]
    .map(([nombre, total]) => ({ nombre, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);
}

/** Convierte un mapa forma_pago → monto en filas ordenadas de mayor a menor, con nombre legible. */
export function filasFormaPago(porFormaPago: Record<string, number>): { nombre: string; total: number }[] {
  return Object.entries(porFormaPago)
    .map(([forma, total]) => ({ nombre: forma.replaceAll("_", " "), total }))
    .sort((a, b) => b.total - a.total);
}

/** «14:00» para la hora 14 (etiqueta del eje). */
export const etiquetaHora = (h: number) => `${String(h).padStart(2, "0")}:00`;
