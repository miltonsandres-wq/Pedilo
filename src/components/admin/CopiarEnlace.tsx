"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Muestra un enlace (relativo al sitio) con botón para copiarlo completo. */
export function CopiarEnlace({ ruta, etiqueta }: { ruta: string; etiqueta: string }) {
  const [copiado, setCopiado] = useState(false);
  const [origen, setOrigen] = useState("");

  async function copiar() {
    const completo = `${window.location.origin}${ruta}`;
    setOrigen(window.location.origin);
    try {
      await navigator.clipboard.writeText(completo);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1800);
    } catch {
      /* sin permiso de portapapeles: el enlace igual se ve en pantalla */
    }
  }

  return (
    <div className="rounded-xl border border-ink-100 bg-ink-50 px-3 py-2.5">
      <p className="text-xs font-medium text-ink-500">{etiqueta}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <code className="min-w-0 truncate text-xs text-ink-800">{origen}{ruta}</code>
        <button type="button" onClick={() => void copiar()} className="flex shrink-0 items-center gap-1 rounded-lg border border-ink-200 bg-white px-2 py-1 text-xs font-medium text-ink-700 hover:bg-ink-100">
          {copiado ? <Check className="h-3 w-3 text-libre-dot" /> : <Copy className="h-3 w-3" />} {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}
