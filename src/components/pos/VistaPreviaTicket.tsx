"use client";

import { useMemo } from "react";
import { ticketAHtml } from "@/lib/printing/ticketHtml";
import type { Instruccion } from "@/lib/printing/types";

/**
 * Vista previa del ticket tal como saldrá en el papel (monoespaciado, mismas
 * líneas que la impresora). Funciona sin ninguna impresora configurada. El texto
 * se escapa en ticketAHtml, así que es seguro inyectarlo.
 */
export function VistaPreviaTicket({ instrucciones, columnas = 48 }: { instrucciones: Instruccion[]; columnas?: number }) {
  const html = useMemo(() => ticketAHtml(instrucciones, { columnas, soloCuerpo: true }), [instrucciones, columnas]);
  // En pantalla el ancho se ajusta a `columnas` caracteres de una fuente monoespaciada
  const ancho = `${columnas + 4}ch`;
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-200 bg-ink-100 p-3">
      <style>{`
        .tk{font-family:ui-monospace,"Courier New",monospace;font-size:12px;line-height:1.3;color:#111;background:#fff;margin:0 auto;padding:12px 8px;box-shadow:0 1px 4px rgba(15,23,42,.18)}
        .tk .l{white-space:pre;overflow:hidden}.tk .b{font-weight:700}.tk .d{font-size:24px;line-height:1.1}
        .tk .c{text-align:center}.tk .r{text-align:right}.tk .i{text-align:left}
      `}</style>
      <div className="tk" style={{ width: ancho, maxWidth: "100%" }} aria-label="Vista previa del ticket" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
