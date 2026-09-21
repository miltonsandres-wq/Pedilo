"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/ui";

/**
 * Fila/tarjeta plegable: colapsada por defecto, muestra `resumen` y abre
 * `children` al tocarla. Reemplaza <details>/<summary> a propósito — en
 * Safari/iOS <summary> dibuja su propio triángulo nativo (::-webkit-details-marker)
 * ADEMÁS del ChevronDown que le pongamos encima, y se ve como dos flechas /
 * roto. Con esto controlamos el 100% del render en cualquier navegador.
 */
export function Colapsable({
  resumen,
  children,
  className,
  contenidoClassName,
  abiertoPorDefecto = false,
}: {
  resumen: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contenidoClassName?: string;
  abiertoPorDefecto?: boolean;
}) {
  const [abierto, setAbierto] = useState(abiertoPorDefecto);

  return (
    <div className={cn("overflow-hidden rounded-xl border border-ink-100 bg-white shadow-card", className)}>
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1">{resumen}</div>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-ink-400 transition-transform", abierto && "rotate-180")}
          strokeWidth={2}
        />
      </button>
      {abierto && (
        <div className={cn("border-t border-ink-100 p-4", contenidoClassName)}>{children}</div>
      )}
    </div>
  );
}
