"use client";

import { useRef, useState, useTransition } from "react";
import { moverMesa } from "@/app/admin/mesas/actions";
import type { Tables } from "@/lib/types/helpers";
import { cn } from "@/lib/ui";

type Mesa = Tables<"mesas">;

const TAMANO_MESA = 34; // px — lado del cuadrado / diámetro del círculo
const RADIO_SILLAS = 26; // px de la mesa al centro de cada silla
const TAMANO_SILLA = 10; // px

/** Puntos (x,y relativos al centro, en px) de cada silla alrededor de la mesa. */
function posicionesSillas(capacidad: number) {
  const n = Math.min(Math.max(capacidad, 1), 12);
  return Array.from({ length: n }, (_, i) => {
    const angulo = (i / n) * 2 * Math.PI - Math.PI / 2;
    return { x: Math.cos(angulo) * RADIO_SILLAS, y: Math.sin(angulo) * RADIO_SILLAS };
  });
}

/** Una mesa con sus sillas alrededor — el mismo render se usa en el plano del
 * admin (arrastrable) y podría reusarse en el mapa del mesero a futuro. */
function MesaConSillas({ mesa }: { mesa: Mesa }) {
  const libre = mesa.estado === "libre";
  const colorMesa = libre ? "bg-libre-bg border-libre-border" : "bg-ocupada-bg border-ocupada-border";
  const colorSilla = libre ? "bg-libre-border" : "bg-ocupada-border";

  return (
    <div className="relative flex h-[5.5rem] w-[5.5rem] items-center justify-center">
      {posicionesSillas(mesa.capacidad).map((p, i) => (
        <span
          key={i}
          className={cn("absolute rounded-[3px]", colorSilla)}
          style={{
            width: TAMANO_SILLA,
            height: TAMANO_SILLA,
            left: `calc(50% + ${p.x}px - ${TAMANO_SILLA / 2}px)`,
            top: `calc(50% + ${p.y}px - ${TAMANO_SILLA / 2}px)`,
          }}
        />
      ))}
      <div
        className={cn(
          "flex flex-col items-center justify-center border-2 text-[10px] font-semibold leading-tight shadow-sm",
          mesa.forma === "redonda" ? "rounded-full" : "rounded-md",
          colorMesa,
          libre ? "text-libre-text" : "text-ocupada-text"
        )}
        style={{ width: TAMANO_MESA + 12, height: TAMANO_MESA + 12 }}
      >
        <span>{mesa.nombre}</span>
      </div>
    </div>
  );
}

/**
 * Plano visual: cada mesa se dibuja como una mesa real (cuadrada o redonda)
 * con sus sillas alrededor según la capacidad, arrastrable dentro de un
 * lienzo de tamaño fijo. La posición se guarda como % (pos_x/pos_y) para que
 * el mismo layout se vea bien en cualquier pantalla. Al soltar, se persiste
 * con el server action `moverMesa`.
 */
export function PlanoMesas({ mesas }: { mesas: Mesa[] }) {
  const lienzoRef = useRef<HTMLDivElement>(null);
  const [posiciones, setPosiciones] = useState<Record<string, { x: number; y: number }>>(
    Object.fromEntries(mesas.map((m) => [m.id, { x: m.pos_x ?? 10, y: m.pos_y ?? 10 }]))
  );
  const [, startTransition] = useTransition();

  function onDrag(id: string, e: React.MouseEvent) {
    const lienzo = lienzoRef.current;
    if (!lienzo) return;
    e.preventDefault();

    function mover(ev: MouseEvent) {
      const rect = lienzo!.getBoundingClientRect();
      const x = Math.min(94, Math.max(0, ((ev.clientX - rect.left) / rect.width) * 100));
      const y = Math.min(88, Math.max(0, ((ev.clientY - rect.top) / rect.height) * 100));
      setPosiciones((prev) => ({ ...prev, [id]: { x, y } }));
    }

    function soltar() {
      window.removeEventListener("mousemove", mover);
      window.removeEventListener("mouseup", soltar);
      const pos = posiciones[id];
      if (pos) startTransition(() => void moverMesa(id, pos.x, pos.y));
    }

    window.addEventListener("mousemove", mover);
    window.addEventListener("mouseup", soltar);
  }

  return (
    <div
      ref={lienzoRef}
      className="relative h-[28rem] w-full overflow-hidden rounded-2xl border border-ink-100 shadow-card"
      style={{
        backgroundColor: "#fbfaf8",
        backgroundImage: "radial-gradient(circle, rgba(20,23,30,0.08) 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }}
    >
      {mesas.map((m) => {
        const pos = posiciones[m.id] ?? { x: 10, y: 10 };
        return (
          <div
            key={m.id}
            onMouseDown={(e) => onDrag(m.id, e)}
            className="absolute -translate-x-1/2 -translate-y-1/2 cursor-move select-none"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            title="Arrastra para reubicar"
          >
            <MesaConSillas mesa={m} />
          </div>
        );
      })}
      {mesas.length === 0 && (
        <p className="flex h-full items-center justify-center text-sm text-ink-400">
          Agrega una mesa para verla aquí
        </p>
      )}
    </div>
  );
}
