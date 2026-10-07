"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/ui";
import { ESTILOS_FLYER, FlyerMesa, type DatosFlyer } from "./FlyerMesa";

/**
 * Vista previa y botón de imprimir de los flyers. Al imprimir solo salen las hojas (el resto del
 * panel se oculta) y cada mesa va en su propia página, en A4 o en A5.
 */
export function FlyersImprimibles({ flyers, volverA }: { flyers: DatosFlyer[]; volverA: string }) {
  const [tam, setTam] = useState<"a4" | "a5">("a4");

  const paginaImpresion = `
    @page { size: ${tam === "a4" ? "A4" : "A5"} portrait; margin: 0 }
    @media print {
      body * { visibility: hidden !important }
      .flyer-imprimir, .flyer-imprimir * { visibility: visible !important }
      .flyer-imprimir { position: absolute; left: 0; top: 0; width: 100%; display: block }
      .flyer-imprimir .flyer-hoja { width: ${tam === "a4" ? "210mm" : "148mm"}; height: ${tam === "a4" ? "297mm" : "210mm"};
        aspect-ratio: auto; border-radius: 0; box-shadow: none; margin: 0; break-after: page; page-break-after: always }
      .flyer-imprimir .flyer-hoja:last-child { break-after: auto; page-break-after: auto }
      .flyer-controles { display: none !important }
    }
  `;

  return (
    <div>
      <style>{ESTILOS_FLYER}</style>
      <style>{paginaImpresion}</style>

      <div className="flyer-controles mb-5 flex flex-wrap items-center gap-3">
        <Link href={volverA} className="flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-800">
          <ArrowLeft className="h-4 w-4" strokeWidth={2} /> Volver a mesas
        </Link>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div className="flex overflow-hidden rounded-lg border border-ink-200 text-xs" role="group" aria-label="Tamaño del papel">
            {(["a4", "a5"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTam(t)}
                aria-pressed={tam === t}
                className={cn("px-3 py-1.5 font-medium", tam === t ? "bg-ink-900 text-white" : "bg-white text-ink-600 hover:bg-ink-50")}
              >
                {t === "a4" ? "Hoja completa (A4)" : "Media hoja (A5)"}
              </button>
            ))}
          </div>
          <Button type="button" onClick={() => window.print()} disabled={flyers.length === 0}>
            <Printer className="h-4 w-4" strokeWidth={2} />
            Imprimir {flyers.length > 1 ? `${flyers.length} flyers` : "flyer"}
          </Button>
        </div>
      </div>

      <p className="flyer-controles mb-4 text-xs text-ink-500">
        En el cuadro de impresión desactiva «Encabezados y pies de página» y deja los márgenes en «Ninguno» para que salga a página completa.
      </p>

      {flyers.length === 0 ? (
        <p className="flyer-controles text-sm text-ink-500">Esta sucursal todavía no tiene mesas.</p>
      ) : (
        <div className={cn("flyer-imprimir grid gap-6 sm:grid-cols-2", tam === "a5" && "flyer-a5")}>
          {flyers.map((f) => (
            <FlyerMesa key={f.mesa + f.qrDataUrl.slice(-12)} f={f} />
          ))}
        </div>
      )}
    </div>
  );
}
