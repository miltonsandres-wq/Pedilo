/**
 * Carrito del menú público. Vive en el navegador del cliente (localStorage) y
 * es solo una conveniencia: el servidor recalcula todo al crear el pedido.
 */
export interface LineaCarrito {
  cantidad: number;
  nota: string;
}
export type Carrito = Record<string, LineaCarrito>;

export interface ProductoPrecio {
  id: string;
  precio: number;
}

export const MAX_POR_PRODUCTO = 50;

export function cambiarCantidad(carrito: Carrito, productoId: string, delta: number): Carrito {
  const nueva = Math.min(MAX_POR_PRODUCTO, Math.max(0, (carrito[productoId]?.cantidad ?? 0) + delta));
  if (nueva === 0) {
    const resto = { ...carrito };
    delete resto[productoId];
    return resto;
  }
  return { ...carrito, [productoId]: { cantidad: nueva, nota: carrito[productoId]?.nota ?? "" } };
}

export function cambiarNota(carrito: Carrito, productoId: string, nota: string): Carrito {
  if (!carrito[productoId]) return carrito;
  return { ...carrito, [productoId]: { ...carrito[productoId], nota: nota.slice(0, 200) } };
}

export const totalUnidades = (carrito: Carrito) =>
  Object.values(carrito).reduce((acc, l) => acc + l.cantidad, 0);

/** Subtotal en centavos enteros -> lempiras (evita errores de coma flotante). */
export function subtotal(carrito: Carrito, productos: ProductoPrecio[]): number {
  const precios = new Map(productos.map((p) => [p.id, p.precio]));
  const centavos = Object.entries(carrito).reduce(
    (acc, [id, l]) => acc + Math.round((precios.get(id) ?? 0) * 100) * l.cantidad,
    0
  );
  return centavos / 100;
}

/**
 * Lo guardado puede estar viejo (producto agotado o quitado del menú, datos
 * corruptos): se queda solo lo que sigue en el menú y con cantidades sanas.
 */
export function limpiarCarrito(crudo: unknown, idsDisponibles: Set<string>): Carrito {
  if (!crudo || typeof crudo !== "object") return {};
  const limpio: Carrito = {};
  for (const [id, l] of Object.entries(crudo as Record<string, unknown>)) {
    if (!idsDisponibles.has(id) || !l || typeof l !== "object") continue;
    const cantidad = Math.floor(Number((l as LineaCarrito).cantidad));
    if (!Number.isFinite(cantidad) || cantidad < 1) continue;
    const nota = typeof (l as LineaCarrito).nota === "string" ? (l as LineaCarrito).nota.slice(0, 200) : "";
    limpio[id] = { cantidad: Math.min(cantidad, MAX_POR_PRODUCTO), nota };
  }
  return limpio;
}

export const claveCarrito = (slug: string) => `pedilo:carrito:${slug}`;
