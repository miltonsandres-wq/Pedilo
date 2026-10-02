"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { CheckCircle2, Loader2, PrinterCheck, TriangleAlert } from "lucide-react";
import { db } from "@/lib/offline/db";
import { agenteImpresionUrl, armarFactura, imprimirDocumentoFiscal, marcarFacturaImpresa, type TicketArmado } from "@/lib/fiscal/impresion";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/ui";
import { ImpresionTicket } from "./ImpresionTicket";

type Estado = { tipo: "reposo" | "imprimiendo" | "ok" } | { tipo: "error"; mensaje: string };

/**
 * Pantalla que sigue a un cobro con factura. Siempre muestra la VISTA PREVIA de
 * la factura y las formas de imprimirla (impresora de la PC, Bluetooth, USB…), así
 * funciona aunque la sucursal no tenga configurado el agente de impresión. Si el
 * agente SÍ está configurado, además imprime el ORIGINAL solo apenas abre (si
 * todavía no se había impreso). Vive en /pos?factura=<id> para sobrevivir a que la
 * orden ya esté pagada y el detalle de la mesa se haya cerrado.
 */
export function FacturaEmitidaModal({ documentoId }: { documentoId: string }) {
  const router = useRouter();
  const doc = useLiveQuery(() => db.documentos_fiscales.get(documentoId), [documentoId]);
  const [estado, setEstado] = useState<Estado>({ tipo: "reposo" });
  const [copia, setCopia] = useState<"cliente" | "emisor">("cliente");
  const [ticket, setTicket] = useState<TicketArmado | null>(null);
  const [agente, setAgente] = useState<string | null | undefined>(undefined);
  const autoImpreso = useRef(false);

  useEffect(() => {
    void agenteImpresionUrl().then(setAgente);
  }, []);

  // Se arma de nuevo si cambia la copia o si ya salió el original (pasa a «REIMPRESIÓN»)
  useEffect(() => {
    let vigente = true;
    void armarFactura(documentoId, { copia }).then((r) => {
      if (vigente && r.ok) setTicket(r.ticket);
    });
    return () => {
      vigente = false;
    };
  }, [documentoId, copia, doc?.impreso_at]);

  const imprimirConAgente = useCallback(
    async (c: "cliente" | "emisor") => {
      setEstado({ tipo: "imprimiendo" });
      const r = await imprimirDocumentoFiscal(documentoId, { copia: c });
      setEstado(r.ok ? { tipo: "ok" } : { tipo: "error", mensaje: r.error ?? "No se pudo imprimir." });
    },
    [documentoId]
  );

  // Impresión automática del original SOLO si hay agente configurado
  useEffect(() => {
    if (doc && agente && !doc.impreso_at && !autoImpreso.current) {
      autoImpreso.current = true;
      void imprimirConAgente("cliente");
    }
  }, [doc, agente, imprimirConAgente]);

  const cerrar = () => router.replace("/pos");

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink-950/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[94vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 shadow-popover sm:rounded-2xl">
        <div className="text-center">
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

          <div className="mt-3 min-h-6 text-sm">
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
                <span>No se pudo imprimir en la impresora de la sucursal: {estado.mensaje}. La factura ya quedó emitida; usa otra opción de abajo.</span>
              </p>
            )}
          </div>
        </div>

        <div className="mt-3 flex gap-2" role="group" aria-label="Copia">
          {(["cliente", "emisor"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCopia(c)}
              className={cn(
                "flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium",
                copia === c ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
              )}
            >
              {c === "cliente" ? "Original: Cliente" : "Copia: Emisor"}
            </button>
          ))}
        </div>

        <div className="mt-3">
          {ticket ? (
            <ImpresionTicket
              ticket={ticket}
              agenteUrl={agente}
              onImpreso={() => {
                if (copia === "cliente") void marcarFacturaImpresa(documentoId);
              }}
            />
          ) : (
            <p className="py-6 text-center text-sm text-ink-400">Preparando vista previa…</p>
          )}
        </div>

        <Button size="lg" className="mt-4 w-full" type="button" onClick={cerrar}>
          Listo
        </Button>
      </div>
    </div>
  );
}
