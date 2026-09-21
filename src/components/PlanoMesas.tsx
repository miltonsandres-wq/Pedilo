"use client";

import { useRef, useState, useTransition } from "react";
import { moverMesa } from "@/app/admin/mesas/actions";
import type { Tables } from "@/lib/types/helpers";
import { cn } from "@/lib/ui";

type Mesa = Tables<"mesas">;

const ANCHO_ASIENTO = 12;
const ALTO_ASIENTO = 11;
const ANCHO_RESPALDO = 9;
const ALTO_RESPALDO = 5;

/** Tamaño de la mesa: crece con la capacidad, para que un 2-top y un 8-top se
 * distingan a simple vista como en un plano real, no solo por el número. */
function ladoMesa(capacidad: number) {
  return 30 + Math.min(Math.max(capacidad, 1), 8) * 3.5;
}

/** Puntos (x,y relativos al centro, en px) + el ángulo hacia afuera de cada
 * silla. El radio depende del tamaño de la mesa (no es fijo) para que el
 * espacio silla-mesa se vea proporcional en un 2-top y en un 8-top. */
function posicionesSillas(capacidad: number, lado: number) {
  const n = Math.min(Math.max(capacidad, 1), 12);
  const radio = lado / 2 + 11;
  return Array.from({ length: n }, (_, i) => {
    const angulo = (i / n) * 2 * Math.PI - Math.PI / 2;
    return {
      x: Math.cos(angulo) * radio,
      y: Math.sin(angulo) * radio,
      deg: (angulo * 180) / Math.PI + 90,
    };
  });
}

/** Una silla vista de arriba: respaldo (barra angosta, tono más oscuro) +
 * asiento (bloque, tono más claro), rotados juntos para "mirar" hacia el
 * centro de la mesa. El contraste de tono es lo que hace que a este tamaño
 * se lea como silla — dos piezas del MISMO color se ven como un solo blob. */
function Silla({
  x,
  y,
  deg,
  colorAsiento,
  colorRespaldo,
}: {
  x: number;
  y: number;
  deg: number;
  colorAsiento: string;
  colorRespaldo: string;
}) {
  return (
    <div
      className="absolute flex flex-col items-center"
      style={{
        left: `calc(50% + ${x}px)`,
        top: `calc(50% + ${y}px)`,
        transform: `translate(-50%, -50%) rotate(${deg}deg)`,
      }}
    >
      <div
        className={cn("rounded-t-[2px]", colorRespaldo)}
        style={{ width: ANCHO_RESPALDO, height: ALTO_RESPALDO }}
      />
      <div
        className={cn("rounded-[2px] shadow-sm", colorAsiento)}
        style={{ width: ANCHO_ASIENTO, height: ALTO_ASIENTO }}
      />
    </div>
  );
}

/**
 * Una mesa con sus sillas alrededor, vista de arriba — sillas con forma real
 * (respaldo + asiento), tamaño según capacidad, y una superficie con
 * degradado + sombra en dos capas para que se lea como un mueble con volumen
 * sobre el piso, no como un ícono plano.
 */
function MesaConSillas({ mesa, arrastrando }: { mesa: Mesa; arrastrando: boolean }) {
  const libre = mesa.estado === "libre";
  const colorBorde = libre ? "border-libre-border" : "border-ocupada-border";
  const colorTexto = libre ? "text-libre-text" : "text-ocupada-text";
  const colorAsiento = libre ? "bg-libre-border" : "bg-ocupada-border";
  const colorRespaldo = libre ? "bg-libre-dot" : "bg-ocupada-dot";
  const superficie = libre
    ? "radial-gradient(circle at 32% 26%, #ffffff, #ecfdf5 78%)"
    : "radial-gradient(circle at 32% 26%, #fff6f6, #fef2f2 78%)";
  const lado = ladoMesa(mesa.capacidad);

  return (
    <div
      className={cn(
        "relative flex h-28 w-28 items-center justify-center transition-transform",
        arrastrando && "scale-110"
      )}
    >
      {/* sombra de contacto: ancla la mesa al piso, independiente de la de elevación */}
      <div
        className="absolute rounded-full bg-black/10 blur-[3px]"
        style={{
          width: lado * 0.85,
          height: lado * 0.32,
          left: "50%",
          top: "58%",
          transform: "translateX(-50%)",
        }}
      />
      {posicionesSillas(mesa.capacidad, lado).map((p, i) => (
        <Silla
          key={i}
          x={p.x}
          y={p.y}
          deg={p.deg}
          colorAsiento={colorAsiento}
          colorRespaldo={colorRespaldo}
        />
      ))}
      <div
        className={cn(
          "relative flex flex-col items-center justify-center border-2 text-[10px] font-semibold leading-tight ring-1 ring-black/5",
          mesa.forma === "redonda" ? "rounded-full" : "rounded-lg",
          colorBorde,
          colorTexto
        )}
        style={{
          width: lado,
          height: lado,
          background: superficie,
          boxShadow: arrastrando
            ? "inset 0 1px 2px rgba(255,255,255,0.9), inset 0 -2px 3px rgba(0,0,0,0.08), 0 12px 20px -6px rgba(20,23,30,0.35)"
            : "inset 0 1px 2px rgba(255,255,255,0.9), inset 0 -2px 3px rgba(0,0,0,0.08), 0 4px 8px -2px rgba(20,23,30,0.18)",
        }}
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
        backgroundColor: "#f3e9dc",
        // "Piso de madera" sutil: vetas verticales (tablones) + una veta
        // horizontal más tenue — todo en gradientes, sin imágenes.
        backgroundImage:
          "repeating-linear-gradient(90deg, rgba(120,84,45,0.07) 0px, rgba(120,84,45,0.07) 1px, transparent 1px, transparent 46px), repeating-linear-gradient(0deg, rgba(120,84,45,0.04) 0px, rgba(120,84,45,0.04) 1px, transparent 1px, transparent 180px), linear-gradient(160deg, rgba(255,255,255,0.5), transparent 40%)",
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
