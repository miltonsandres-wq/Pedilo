"use client";

import { useEffect, useState } from "react";
import { XCircle, Clock, WifiOff, HelpCircle } from "lucide-react";

const ERRORES = [
  { icon: XCircle, texto: "Mesa 4 pidió sin cebolla. Llegó con cebolla. Otra vez." },
  { icon: Clock, texto: "11:40 pm y todavía sacando cuentas con calculadora." },
  { icon: WifiOff, texto: "Se fue el internet a medio turno... y el sistema con él." },
  { icon: HelpCircle, texto: "¿Cuánto vendimos hoy? Nadie sabe hasta mañana." },
] as const;

const INTERVALO_MS = 3500;

/** Carrusel de errores reales de restaurante, en el hero — el "¿te duele esto?" antes de la solución. */
export function ErrorSlideshow() {
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndice((i) => (i + 1) % ERRORES.length);
    }, INTERVALO_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mx-auto mt-8 w-full max-w-md">
      <div className="relative h-16 overflow-hidden rounded-2xl border border-white/15 bg-white/5">
        {ERRORES.map((error, i) => (
          <div
            key={error.texto}
            aria-hidden={i !== indice}
            className={`absolute inset-0 flex items-center gap-3 px-4 transition-opacity duration-700 ease-in-out ${
              i === indice ? "opacity-100" : "opacity-0"
            }`}
          >
            <error.icon className="h-5 w-5 shrink-0 text-brand-400" strokeWidth={2} />
            <p className="text-left text-sm text-ink-200">{error.texto}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-center gap-1.5">
        {ERRORES.map((error, i) => (
          <button
            key={error.texto}
            type="button"
            onClick={() => setIndice(i)}
            aria-label={`Ver error ${i + 1} de ${ERRORES.length}`}
            className={`h-1.5 rounded-full transition-all ${
              i === indice ? "w-5 bg-brand-500" : "w-1.5 bg-white/20"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
