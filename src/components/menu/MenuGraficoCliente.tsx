"use client";

import { useId, useState } from "react";
import { Minus, Plus, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatearLempiras } from "@/lib/delivery/validaciones";
import { cn } from "@/lib/ui";

export interface ProductoGrafico {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  foto_url: string | null;
  categoria_id: string | null;
  /** Es plato del día de hoy: tiene su propia categoría al principio. */
  plato_dia?: boolean;
}

const DIA = "__plato_dia__";
const OTROS = "__otros__";

/**
 * Menú gráfico para el cliente (carta del QR y menú de delivery): las categorías
 * van como botones (arriba en el celular, a un lado en pantalla ancha) y al
 * elegir una salen sus platos en tarjetas grandes con foto, precio y el botón
 * para agregar. Es el mismo estilo del menú del POS.
 */
export function MenuGraficoCliente({
  productos,
  categorias,
  cantidades,
  activo = true,
  onCambiar,
}: {
  productos: ProductoGrafico[];
  categorias: { id: string; nombre: string }[];
  /** Cantidad pedida de cada producto (por id). */
  cantidades: Record<string, number>;
  /** false = solo se ve el menú (por ejemplo, el local está cerrado): sin botones de agregar. */
  activo?: boolean;
  onCambiar: (productoId: string, delta: number) => void;
}) {
  const base = useId();
  const sinCategoria = (p: ProductoGrafico) => !p.categoria_id || !categorias.some((c) => c.id === p.categoria_id);
  const platosDelDia = productos.filter((p) => p.plato_dia);

  const grupos: { id: string; nombre: string; items: ProductoGrafico[] }[] = [
    ...(platosDelDia.length > 0 ? [{ id: DIA, nombre: "⭐ Platos del día", items: platosDelDia }] : []),
    ...categorias
      .map((c) => ({ id: c.id, nombre: c.nombre, items: productos.filter((p) => p.categoria_id === c.id) }))
      .filter((g) => g.items.length > 0),
    ...(productos.some(sinCategoria) ? [{ id: OTROS, nombre: "Más", items: productos.filter(sinCategoria) }] : []),
  ];

  const [sel, setSel] = useState<string | null>(null);
  const activa = grupos.find((g) => g.id === sel) ?? grupos[0];
  if (!activa) return null;

  const idTab = (g: string) => `${base}-tab-${g}`;
  const idPanel = `${base}-panel`;

  return (
    <div className="lg:flex lg:items-start lg:gap-5">
      <div
        role="tablist"
        aria-label="Categorías"
        aria-orientation="horizontal"
        className="sticky top-0 z-10 mb-4 flex gap-2 overflow-x-auto rounded-2xl border border-ink-100 bg-white/95 p-2 shadow-card backdrop-blur lg:static lg:top-4 lg:mb-0 lg:w-48 lg:shrink-0 lg:flex-col lg:overflow-visible"
      >
        {grupos.map((g) => {
          const enPedido = g.items.reduce((s, p) => s + (cantidades[p.id] ?? 0), 0);
          const seleccionado = activa.id === g.id;
          return (
            <button
              key={g.id}
              id={idTab(g.id)}
              type="button"
              role="tab"
              aria-selected={seleccionado}
              aria-controls={idPanel}
              onClick={() => setSel(g.id)}
              className={cn(
                "flex shrink-0 items-center justify-between gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition lg:whitespace-normal lg:rounded-xl lg:px-3 lg:py-3 lg:text-left",
                seleccionado ? "bg-brand-500 text-white shadow-card" : "bg-ink-50 text-ink-700 hover:bg-ink-100"
              )}
            >
              <span>{g.nombre}</span>
              {enPedido > 0 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "rounded-full px-1.5 text-xs font-bold tabular-nums",
                    seleccionado ? "bg-white text-brand-700" : "bg-brand-500 text-white"
                  )}
                >
                  {enPedido}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <section id={idPanel} role="tabpanel" aria-labelledby={idTab(activa.id)} className="min-w-0 flex-1">
        <h2 className="mb-3 text-base font-semibold text-ink-900">{activa.nombre}</h2>
        <ul role="list" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {activa.items.map((p) => (
            <TarjetaPlato key={p.id} producto={p} cantidad={cantidades[p.id] ?? 0} activo={activo} onCambiar={onCambiar} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function TarjetaPlato({
  producto: p,
  cantidad,
  activo,
  onCambiar,
}: {
  producto: ProductoGrafico;
  cantidad: number;
  activo: boolean;
  onCambiar: (productoId: string, delta: number) => void;
}) {
  return (
    <li
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-white shadow-card transition",
        cantidad > 0 ? "border-brand-500 ring-2 ring-brand-500/30" : "border-ink-100"
      )}
    >
      <div className="aspect-[4/3] w-full bg-ink-100">
        {p.foto_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.foto_url} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-ink-300" aria-hidden="true">
            <UtensilsCrossed className="h-10 w-10" strokeWidth={1.5} />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <p className="break-words text-sm font-semibold leading-snug text-ink-900">{p.nombre}</p>
        {p.descripcion && (
          <p className="mt-0.5 whitespace-pre-line break-words text-xs leading-snug text-ink-500">{p.descripcion}</p>
        )}
        <p className="mt-1 text-base font-bold tabular-nums text-brand-700">{formatearLempiras(p.precio)}</p>
        {activo && (
          <div className="mt-auto pt-3">
            {cantidad === 0 ? (
              <Button type="button" size="sm" className="w-full" aria-label={`Agregar ${p.nombre}`} onClick={() => onCambiar(p.id, 1)}>
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                Agregar
              </Button>
            ) : (
              <div className="flex items-center justify-between rounded-full bg-brand-50 p-1">
                <button
                  type="button"
                  aria-label={`Quitar uno de ${p.nombre}`}
                  onClick={() => onCambiar(p.id, -1)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-brand-700 shadow-sm active:scale-90"
                >
                  <Minus className="h-4 w-4" strokeWidth={2.5} />
                </button>
                <span className="text-sm font-bold tabular-nums text-brand-800" aria-label={`${cantidad} de ${p.nombre}`}>
                  {cantidad}
                </span>
                <button
                  type="button"
                  aria-label={`Sumar uno de ${p.nombre}`}
                  onClick={() => onCambiar(p.id, 1)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-white shadow-sm active:scale-90"
                >
                  <Plus className="h-4 w-4" strokeWidth={2.5} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
