"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { CheckCircle2, Loader2, Printer, PrinterCheck, TriangleAlert } from "lucide-react";
import { db } from "@/lib/offline/db";
import { imprimirDocumentoFiscal } from "@/lib/fiscal/impresion";
import { Button } from "@/components/ui/Button";

type Estado = { tipo: "reposo" | "imprimiendo" | "ok" } | { tipo: "error"; mensaje: string };

/**
 * Pantalla que sigue a un cobro con factura: imprime el ORIGINAL apenas abre
 * (si todavía no se había impreso bien) y deja reimprimir o sacar la copia
 * del emisor. Vive en /pos?factura=<id> para sobrevivir a que la orden ya
 * esté pagada y el detalle de la mesa se haya cerrado.
 */
export function FacturaEmitidaModal({ documentoId }: { documentoId: string }) {
  const router = useRouter();
  const doc = useLiveQuery(() => db.documentos_fiscales.get(documentoId), [documentoId]);
  const [estado, setEstado] = useState<Estado>({ tipo: "reposo" });
  const autoImpreso = useRef(false);

  const imprimir = useCallback(
    async (copia: "cliente" | "emisor") => {
      setEstado({ tipo: "imprimiendo" });
      const r = await imprimirDocumentoFiscal(documentoId, { copia });
      setEstado(r.ok ? { tipo: "ok" } : { tipo: "error", mensaje: r.error ?? "No se pudo imprimir." });
    },
    [documentoId]
  );

  useEffect(() => {
    if (doc && !doc.impreso_at && !autoImpreso.current) {
      autoImpreso.current = true;
      void imprimir("cliente");
    }
  }, [doc, imprimir]);

  const cerrar = () => router.replace("/pos");

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink-950/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-6 text-center shadow-popover sm:rounded-2xl">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-libre-bg text-libre-text">
          <CheckCircle2 className="h-6 w-6" strokeWidth={2} />
        </div>
        <h2 className="text-base font-semibold text-ink-900">Cobro completado</h2>

        {doc ? (
          <div className="mt-2 text-sm text-ink-600">
            <p>
              Factura <span className="font-mono font-medium text-ink-900">{doc.numero_completo}</span>
            </p>
            <p>
              {doc.cliente_nombre} · <span className="font-semibold text-ink-900">L. {Number(doc.total).toFixed(2)}</span>
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-500">Cargando factura…</p>
        )}

        <div className="mt-4 min-h-10 text-sm">
          {estado.tipo === "imprimiendo" && (
            <p className="flex items-center justify-center gap-2 text-ink-500">
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} /> Imprimiendo…
            </p>
          )}
          {estado.tipo === "ok" && (
            <p className="flex items-center justify-center gap-2 text-libre-text">
              <PrinterCheck className="h-4 w-4" strokeWidth={2} /> Impresa
            </p>
          )}
          {estado.tipo === "error" && (
            <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-left text-red-700">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
              <span>
                No se pudo imprimir: {estado.mensaje}. La factura ya quedó emitida; reintenta la impresión.
              </span>
            </p>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <Button
            variant="secondary"
            size="lg"
            className="flex-1"
            type="button"
            disabled={!doc || estado.tipo === "imprimiendo"}
            onClick={() => void imprimir("cliente")}
          >
            <Printer className="h-4 w-4" strokeWidth={2} />
            {estado.tipo === "error" ? "Reintentar" : "Reimprimir"}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="flex-1"
            type="button"
            disabled={!doc || estado.tipo === "imprimiendo"}
            onClick={() => void imprimir("emisor")}
          >
            Copia emisor
          </Button>
        </div>
        <Button size="lg" className="mt-2 w-full" type="button" onClick={cerrar}>
          Listo
        </Button>
      </div>
    </div>
  );
}
