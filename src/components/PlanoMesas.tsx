"use client";

import { useRef, useState, useTransition } from "react";
import { moverMesa } from "@/app/admin/mesas/actions";
import type { Tables } from "@/lib/types/helpers";
import { cn } from "@/lib/ui";

type Mesa = Tables<"mesas">;

const TAMANO_MESA = 34; // px — lado del cuadrado / diámetro del círculo
const RADIO_SILLAS = 27; // px de la mesa al centro de cada silla
const ANCHO_SILLA = 9; // px
const ALTO_SILLA = 12; // px (más alta que ancha: simula el respaldo)

/** Puntos (x,y relativos al centro, en px) + el ángulo hacia afuera de cada silla. */
function posicionesSillas(capacidad: number) {
  const n = Math.min(Math.max(capacidad, 1), 12);
  return Array.from({ length: n }, (_, i) => {
    const angulo = (i / n) * 2 * Math.PI - Math.PI / 2;
    return {
      x: Math.cos(angulo) * RADIO_SILLAS,
      y: Math.sin(angulo) * RADIO_SILLAS,
      deg: (angulo * 180) / Math.PI + 90,
    };
  });
}

/**
 * Una mesa con sus sillas alrededor, vista de arriba — cada silla rotada para
 * "mirar" hacia el centro de la mesa, y la superficie con un degradado sutil
 * en vez de un color plano, para que se lea como un mueble real y no un ícono.
 */
function MesaConSillas({ mesa, arrastrando }: { mesa: Mesa; arrastrando: boolean }) {
  const libre = mesa.estado === "libre";
  const colorBorde = libre ? "border-libre-border" : "border-ocupada-border";
  const colorTexto = libre ? "text-libre-text" : "text-ocupada-text";
  const colorSilla = libre ? "bg-libre-border" : "bg-ocupada-border";
  const superficie = libre
    ? "radial-gradient(circle at 32% 28%, #ffffff, #ecfdf5 75%)"
    : "radial-gradient(circle at 32% 28%, #fff6f6, #fef2f2 75%)";

  return (
    <div
      className={cn(
        "relative flex h-[5.5rem] w-[5.5rem] items-center justify-center transition-transform",
        arrastrando && "scale-110"
      )}
    >
      {posicionesSillas(mesa.capacidad).map((p, i) => (
        <span
          key={i}
          className={cn("absolute rounded-[3px] shadow-sm", colorSilla)}
          style={{
            width: ANCHO_SILLA,
            height: ALTO_SILLA,
            left: `calc(50% + ${p.x}px - ${ANCHO_SILLA / 2}px)`,
            top: `calc(50% + ${p.y}px - ${ALTO_SILLA / 2}px)`,
            transform: `rotate(${p.deg}deg)`,
          }}
        />
      ))}
      <div
        className={cn(
          "flex flex-col items-center justify-center border-2 text-[10px] font-semibold leading-tight ring-1 ring-black/5",
          mesa.forma === "redonda" ? "rounded-full" : "rounded-md",
          colorBorde,
          colorTexto,
          arrastrando ? "shadow-xl" : "shadow-md"
        )}
        style={{ width: TAMANO_MESA + 12, height: TAMANO_MESA + 12, background: superficie }}
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
 *
 * Usa Pointer Events (no Mouse Events) para que funcione igual con mouse,
 * touch y lápiz — con solo mouse events el arrastre no existe en celular o
 * tablet, que es como se usa esta pantalla en el local la mayoría de veces.
 */
export function PlanoMesas({ mesas }: { mesas: Mesa[] }) {
  const lienzoRef = useRef<HTMLDivElement>(null);
  const [posiciones, setPosiciones] = useState<Record<string, { x: number; y: number }>>(
    Object.fromEntries(mesas.map((m) => [m.id, { x: m.pos_x ?? 10, y: m.pos_y ?? 10 }]))
  );
  const [arrastrandoId, setArrastrandoId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function onDrag(id: string, e: React.PointerEvent) {
    const lienzo = lienzoRef.current;
    if (!lienzo) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setArrastrandoId(id);

    // Ref (no state) para la posición en vivo: `soltar` se define UNA vez por
    // gesto y quedaría con el `posiciones` "viejo" del render si leyera del
    // state directamente — por eso el arrastre antes guardaba la posición de
    // ANTES de mover la mesa, no donde de verdad se soltó.
    const posicionActual = { ...posiciones[id] };

    function mover(ev: PointerEvent) {
      const rect = lienzo!.getBoundingClientRect();
      const x = Math.min(94, Math.max(0, ((ev.clientX - rect.left) / rect.width) * 100));
      const y = Math.min(88, Math.max(0, ((ev.clientY - rect.top) / rect.height) * 100));
      posicionActual.x = x;
      posicionActual.y = y;
      setPosiciones((prev) => ({ ...prev, [id]: { x, y } }));
    }

    function soltar() {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
      setArrastrandoId(null);
      startTransition(() => void moverMesa(id, posicionActual.x, posicionActual.y));
    }

    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
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
        const arrastrando = arrastrandoId === m.id;
        return (
          <div
            key={m.id}
            onPointerDown={(e) => onDrag(m.id, e)}
            className="absolute -translate-x-1/2 -translate-y-1/2 cursor-move select-none touch-none"
            style={{ left: `${pos.x}%`, top: `${pos.y}%`, zIndex: arrastrando ? 10 : 1 }}
            title="Arrastra para reubicar"
          >
            <MesaConSillas mesa={m} arrastrando={arrastrando} />
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
