"use client";

import { useActionState, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { guardarMensajeFlyer } from "@/app/admin/mesas/actions";
import { Button } from "@/components/ui/Button";
import { MAX_MENSAJE_FLYER, MENSAJE_FLYER_POR_DEFECTO, SUGERENCIAS_FLYER } from "@/lib/flyer/mensaje";

/** Edita el mensaje llamativo del flyer del QR de una sucursal, con ideas para elegir con un toque. */
export function MensajeFlyerForm({ sucursalId, mensajeInicial }: { sucursalId: string; mensajeInicial: string | null }) {
  const [texto, setTexto] = useState(mensajeInicial ?? "");
  const [estado, accion, pendiente] = useActionState(guardarMensajeFlyer.bind(null, sucursalId), null);

  return (
    <form action={accion}>
      <label htmlFor="mensaje_flyer" className="mb-1.5 block text-xs font-medium text-ink-500">
        Mensaje del flyer (sale grande, arriba del QR)
      </label>
      <textarea
        id="mensaje_flyer"
        name="mensaje_flyer"
        rows={2}
        maxLength={MAX_MENSAJE_FLYER}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={MENSAJE_FLYER_POR_DEFECTO}
        className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 sm:text-sm"
      />
      <div className="mt-1 flex items-center justify-between text-xs text-ink-400">
        <span>Si lo dejas vacío se usa: «{MENSAJE_FLYER_POR_DEFECTO}»</span>
        <span className="tabular-nums">
          {texto.length}/{MAX_MENSAJE_FLYER}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Ideas de mensaje">
        {SUGERENCIAS_FLYER.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setTexto(s)}
            className="rounded-full border border-ink-200 bg-white px-2.5 py-1 text-xs text-ink-600 hover:border-brand-300 hover:bg-brand-50"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" variant="dark" disabled={pendiente}>
          {pendiente ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />}
          Guardar mensaje
        </Button>
        {estado && (
          <span role={estado.ok ? "status" : "alert"} className={estado.ok ? "text-xs text-libre-text" : "text-xs text-red-600"}>
            {estado.mensaje}
          </span>
        )}
      </div>
    </form>
  );
}
