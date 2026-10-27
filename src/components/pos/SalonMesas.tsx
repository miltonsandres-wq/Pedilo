"use client";

import { useState } from "react";
import { Users, UtensilsCrossed } from "lucide-react";
import type { MesaLocal, OrdenLocal } from "@/lib/offline/db";
import { mesasDeZona, posicionDe, tienePlano, zonasDeMesas } from "@/lib/pos/plano";
import { cn } from "@/lib/ui";

/**
 * Las mesas del POS: el plano del local (mesas acomodadas como las dejó el admin)
 * o, si todavía no las ubicó, la cuadrícula de siempre. Con varias zonas
 * (Terraza, Salón…) se separan en pestañas.
 */
export function SalonMesas({
  mesas,
  ordenPorMesa,
  onClic,
}: {
  mesas: MesaLocal[];
  ordenPorMesa: Map<string | null, OrdenLocal>;
  onClic: (mesa: MesaLocal) => void;
}) {
  const zonas = zonasDeMesas(mesas);
  const [zonaSel, setZonaSel] = useState<string | null>(null);
  const zona = zonaSel && zonas.includes(zonaSel) ? zonaSel : (zonas[0] ?? null);
  const delasZona = zona && zonas.length > 1 ? mesasDeZona(mesas, zona) : mesas;
  const ocupadas = (lista: MesaLocal[]) => lista.filter((m) => ordenPorMesa.has(m.id)).length;

  if (mesas.length === 0) {
    return (
      <p className="text-sm text-ink-500">No hay mesas configuradas todavía (pídele al admin que las cree).</p>
    );
  }

  return (
    <div>
      {zonas.length > 1 && (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Zonas del local">
          {zonas.map((z) => {
            const n = ocupadas(mesasDeZona(mesas, z));
            return (
              <button
                key={z}
                type="button"
                role="tab"
                aria-selected={zona === z}
                onClick={() => setZonaSel(z)}
                className={cn(
                  "shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition",
                  zona === z ? "border-brand-500 bg-brand-500 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-brand-500"
                )}
              >
                {z}
                {n > 0 && (
                  <span className={cn("ml-2 rounded-full px-1.5 py-0.5 text-[11px]", zona === z ? "bg-white/25" : "bg-ocupada-bg text-ocupada-text")}>
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {tienePlano(delasZona) ? (
        <Plano mesas={delasZona} ordenPorMesa={ordenPorMesa} onClic={onClic} />
      ) : (
        <Cuadricula mesas={delasZona} ordenPorMesa={ordenPorMesa} onClic={onClic} />
      )}
    </div>
  );
}

type Props = {
  mesas: MesaLocal[];
  ordenPorMesa: Map<string | null, OrdenLocal>;
  onClic: (mesa: MesaLocal) => void;
};

function estiloDe(orden: OrdenLocal | undefined) {
  const sinPedido = !!orden && orden.total === 0;
  const estilo = !orden
    ? "border-libre-border bg-libre-bg text-libre-text hover:brightness-95"
    : sinPedido
      ? "border-amber-300 bg-amber-50 text-amber-800 hover:brightness-95"
      : "border-ocupada-border bg-ocupada-bg text-ocupada-text hover:brightness-95";
  return { estilo, sinPedido };
}

/** Lo que se ve dentro de cada mesa: nombre y, según el estado, capacidad / cliente / total. */
function Contenido({ mesa, orden, compacto = false }: { mesa: MesaLocal; orden: OrdenLocal | undefined; compacto?: boolean }) {
  const { sinPedido } = estiloDe(orden);
  return (
    <>
      {!compacto && <UtensilsCrossed className="h-5 w-5 opacity-70" strokeWidth={2} />}
      <span className="max-w-full truncate">{mesa.nombre}</span>
      {orden ? (
        <>
          {orden.cliente_nombre && (
            <span className="max-w-full truncate text-[11px] font-normal opacity-80">{orden.cliente_nombre}</span>
          )}
          <span className="text-[11px] font-normal opacity-70">{sinPedido ? "sin pedido" : "L. " + orden.total.toFixed(2)}</span>
        </>
      ) : (
        <span className="flex items-center gap-1 text-[11px] font-normal opacity-70">
          <Users className="h-3 w-3" strokeWidth={2} />
          {mesa.capacidad}
        </span>
      )}
    </>
  );
}

function Cuadricula({ mesas, ordenPorMesa, onClic }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {mesas.map((mesa) => {
        const orden = ordenPorMesa.get(mesa.id);
        return (
          <button
            key={mesa.id}
            onClick={() => onClic(mesa)}
            className={cn(
              "flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border-2 p-3 text-sm font-semibold shadow-card transition active:scale-95",
              estiloDe(orden).estilo
            )}
          >
            <Contenido mesa={mesa} orden={orden} />
          </button>
        );
      })}
    </div>
  );
}

/** Tamaño de la mesa en el plano: crece con la capacidad, como en el editor del admin. */
const ladoMesa = (capacidad: number) => 68 + Math.min(Math.max(capacidad, 1), 8) * 3;

function Plano({ mesas, ordenPorMesa, onClic }: Props) {
  const ubicadas = mesas.filter((m) => posicionDe(m));
  const sinUbicar = mesas.filter((m) => !posicionDe(m));

  return (
    <div>
      <div
        data-testid="plano-salon"
        className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-ink-100 shadow-card sm:aspect-[4/3]"
        style={{
          backgroundColor: "#f3e9dc",
          backgroundImage:
            "repeating-linear-gradient(90deg, rgba(120,84,45,0.07) 0px, rgba(120,84,45,0.07) 1px, transparent 1px, transparent 46px), linear-gradient(160deg, rgba(255,255,255,0.5), transparent 40%)",
        }}
      >
        {ubicadas.map((mesa) => {
          const pos = posicionDe(mesa)!;
          const orden = ordenPorMesa.get(mesa.id);
          const lado = ladoMesa(mesa.capacidad);
          const redonda = (mesa as MesaLocal & { forma?: string | null }).forma === "redonda";
          return (
            <button
              key={mesa.id}
              onClick={() => onClic(mesa)}
              data-pos-x={pos.x}
              data-pos-y={pos.y}
              className={cn(
                "absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-0.5 border-2 px-1 text-xs font-semibold shadow-card transition active:scale-95",
                redonda ? "rounded-full" : "rounded-2xl",
                estiloDe(orden).estilo
              )}
              style={{
                width: lado,
                height: lado,
                // el centro nunca se sale del lienzo, aunque la pantalla sea angosta
                left: `clamp(${lado / 2 + 2}px, ${pos.x}%, calc(100% - ${lado / 2 + 2}px))`,
                top: `clamp(${lado / 2 + 2}px, ${pos.y}%, calc(100% - ${lado / 2 + 2}px))`,
              }}
            >
              <Contenido mesa={mesa} orden={orden} compacto />
            </button>
          );
        })}
      </div>

      {sinUbicar.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">Mesas sin ubicar en el plano</p>
          <Cuadricula mesas={sinUbicar} ordenPorMesa={ordenPorMesa} onClic={onClic} />
        </div>
      )}
    </div>
  );
}
