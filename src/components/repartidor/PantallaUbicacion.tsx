"use client";

import { Eye, LocateFixed, ShieldCheck } from "lucide-react";

/**
 * Pantalla previa al permiso de ubicación: explica para qué y cuándo se usa
 * ANTES de que el navegador pregunte. Aceptar queda registrado en el servidor.
 */
export function PantallaUbicacion({ onAceptar, onRechazar }: { onAceptar: () => void; onRechazar: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-ubicacion">
      <div className="max-h-[95vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 text-black sm:rounded-3xl">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-amber-300"><LocateFixed className="h-8 w-8" strokeWidth={2.5} /></div>
        <h2 id="titulo-ubicacion" className="text-center text-2xl font-black">Compartir tu ubicación</h2>
        <ul className="mt-4 space-y-3 text-lg font-semibold">
          <li className="flex gap-3"><Eye className="mt-1 h-5 w-5 shrink-0" /> El cliente y el restaurante verán dónde vas <b>mientras tengas un pedido en camino</b>.</li>
          <li className="flex gap-3"><ShieldCheck className="mt-1 h-5 w-5 shrink-0" /> Solo se usa en pedidos en camino. Al entregar el último, se apaga. <b>Nunca</b> se rastrea fuera de una entrega.</li>
          <li className="flex gap-3"><LocateFixed className="mt-1 h-5 w-5 shrink-0" /> Funciona con la app abierta y la pantalla encendida (la app la mantendrá prendida).</li>
        </ul>
        <p className="mt-4 rounded-xl bg-ink-100 p-3 text-base font-semibold">Si no quieres compartirla, puedes entregar igual: el restaurante verá que tu ubicación está desactivada.</p>
        <div className="mt-5 grid gap-3">
          <button type="button" onClick={onAceptar} className="min-h-14 rounded-2xl border-2 border-black bg-amber-300 text-xl font-extrabold">Entiendo, activar ubicación</button>
          <button type="button" onClick={onRechazar} className="min-h-14 rounded-2xl border-2 border-black bg-white text-lg font-extrabold">Ahora no</button>
        </div>
      </div>
    </div>
  );
}
