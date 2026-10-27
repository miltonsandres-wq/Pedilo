"use client";

import { useState } from "react";
import { Check, ImageOff, Minus, Plus } from "lucide-react";
import type { CategoriaLocal, OrdenItemLocal, ProductoLocal } from "@/lib/offline/db";
import { actualizarCantidadItem, agregarItem, eliminarItem } from "@/lib/pos/acciones";
import { esPlatoDelDia } from "@/lib/menu/platosDelDia";
import { cn } from "@/lib/ui";

const DIA = "__plato_dia__";
const SIN_CATEGORIA = "__sin_categoria__";

/**
 * Menú a pantalla completa: categorías a la izquierda y los platos en tarjetas
 * grandes con foto. Un toque agrega el plato a la comanda; los botones − / +
 * de la tarjeta corrigen la cantidad sin salir del menú.
 */
export function MenuGrafico({
  ordenId,
  productos,
  categorias,
  items,
  onCerrar,
}: {
  ordenId: string;
  productos: ProductoLocal[];
  categorias: CategoriaLocal[];
  items: OrdenItemLocal[];
  onCerrar: () => void;
}) {
  const platosDelDia = productos.filter((p) => esPlatoDelDia(p.plato_dia_fecha));
  const sinCategoria = (p: ProductoLocal) => !p.categoria_id || !categorias.some((c) => c.id === p.categoria_id);

  const grupos = [
    ...(platosDelDia.length > 0 ? [{ id: DIA, nombre: "⭐ Platos del día" }] : []),
    ...[...categorias]
      .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
      .filter((c) => productos.some((p) => p.categoria_id === c.id))
      .map((c) => ({ id: c.id, nombre: c.nombre })),
    ...(productos.some(sinCategoria) ? [{ id: SIN_CATEGORIA, nombre: "Otros" }] : []),
  ];

  const [sel, setSel] = useState<string | null>(null);
  const activa = sel && grupos.some((g) => g.id === sel) ? sel : (grupos[0]?.id ?? null);

  const visibles =
    activa === DIA
      ? platosDelDia
      : activa === SIN_CATEGORIA
        ? productos.filter(sinCategoria)
        : productos.filter((p) => p.categoria_id === activa);

  // Cantidad total pedida de cada producto (suma de todas sus filas en la comanda)
  const cantidadDe = (productoId: string) =>
    items.filter((i) => i.producto_id === productoId).reduce((s, i) => s + i.cantidad, 0);
  // Fila que se puede tocar sin reimprimir lo que cocina ya recibió: la sin enviar y sin nota
  const filaEditable = (productoId: string) =>
    items.find((i) => i.producto_id === productoId && !i.impreso && !i.nota);

  async function sumar(p: ProductoLocal) {
    const fila = filaEditable(p.id);
    if (fila) {
      await actualizarCantidadItem({ itemId: fila.id, ordenId, nuevaCantidad: fila.cantidad + 1 });
      return;
    }
    await agregarItem({
      ordenId,
      productoId: p.id,
      nombreProducto: p.nombre,
      precioUnitario: p.precio,
      cantidad: 1,
    });
  }

  async function restar(p: ProductoLocal) {
    const fila = filaEditable(p.id);
    if (!fila) return; // lo ya enviado a cocina se corrige desde la comanda
    if (fila.cantidad > 1) {
      await actualizarCantidadItem({ itemId: fila.id, ordenId, nuevaCantidad: fila.cantidad - 1 });
    } else {
      await eliminarItem({ itemId: fila.id, ordenId });
    }
  }

  const totalItems = items.reduce((s, i) => s + i.cantidad, 0);

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-ink-50" role="dialog" aria-label="Menú">
      <div className="flex items-center justify-between border-b border-ink-100 bg-white px-4 py-3">
        <h2 className="text-lg font-semibold text-ink-900">Menú</h2>
        <button
          type="button"
          onClick={onCerrar}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-card active:scale-95"
        >
          <Check className="h-4 w-4" strokeWidth={2.5} />
          Listo{totalItems > 0 ? ` · ${totalItems}` : ""}
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Categorías al lado */}
        <nav
          className="flex w-28 shrink-0 flex-col gap-2 overflow-y-auto border-r border-ink-100 bg-white p-2 sm:w-44"
          role="tablist"
          aria-label="Categorías"
          aria-orientation="vertical"
        >
          {grupos.map((g) => (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={activa === g.id}
              onClick={() => setSel(g.id)}
              className={cn(
                "rounded-xl px-3 py-4 text-left text-sm font-semibold leading-tight transition sm:text-base",
                activa === g.id ? "bg-brand-500 text-white shadow-card" : "bg-ink-50 text-ink-700 hover:bg-ink-100"
              )}
            >
              {g.nombre}
            </button>
          ))}
          {grupos.length === 0 && <p className="p-2 text-xs text-ink-400">No hay productos disponibles.</p>}
        </nav>

        {/* Platos grandes con foto */}
        <div className="min-w-0 flex-1 overflow-y-auto p-3 sm:p-4">
          <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibles.map((p) => {
              const cant = cantidadDe(p.id);
              return (
                <div
                  key={p.id}
                  className={cn(
                    "relative overflow-hidden rounded-2xl border bg-white shadow-card transition",
                    cant > 0 ? "border-brand-500 ring-2 ring-brand-500/30" : "border-ink-100"
                  )}
                >
                  <button
                    type="button"
                    aria-label={`Agregar ${p.nombre}`}
                    onClick={() => void sumar(p)}
                    className="block w-full text-left active:scale-[0.98]"
                  >
                    <div className="aspect-[4/3] w-full bg-ink-100">
                      {p.foto_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.foto_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-ink-300">
                          <ImageOff className="h-10 w-10" strokeWidth={1.5} />
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="text-base font-semibold leading-snug text-ink-900">{p.nombre}</p>
                      {p.descripcion && <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">{p.descripcion}</p>}
                      <p className="mt-1 text-base font-bold tabular-nums text-brand-700">L. {p.precio.toFixed(2)}</p>
                    </div>
                  </button>

                  {cant > 0 && (
                    <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-white/95 p-1 shadow-card">
                      <button
                        type="button"
                        aria-label={`Quitar uno de ${p.nombre}`}
                        onClick={() => void restar(p)}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-100 text-ink-700 active:scale-90"
                      >
                        <Minus className="h-4 w-4" strokeWidth={2.5} />
                      </button>
                      <span className="min-w-6 text-center text-sm font-bold tabular-nums text-ink-900">{cant}</span>
                      <button
                        type="button"
                        aria-label={`Sumar uno de ${p.nombre}`}
                        onClick={() => void sumar(p)}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-white active:scale-90"
                      >
                        <Plus className="h-4 w-4" strokeWidth={2.5} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
