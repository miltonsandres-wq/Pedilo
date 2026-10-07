"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { CheckCircle2 } from "lucide-react";
import { db } from "@/lib/offline/db";
import { agenteImpresionUrl, armarFactura, marcarFacturaImpresa, type TicketArmado } from "@/lib/fiscal/impresion";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/ui";
import { ImpresionTicket } from "./ImpresionTicket";

/**
 * Pantalla que sigue a un cobro con factura CAI: ofrece «Imprimir factura» y,
 * al presionarlo, se manda a imprimir (impresora de la sucursal si hay agente;
 * si no, la del equipo, Bluetooth, USB…). No muestra vista previa ni imprime
 * sola. Vive en /pos?factura=<id> para sobrevivir a que la orden ya esté pagada
 * y el detalle de la mesa se haya cerrado.
 */
export function FacturaEmitidaModal({ documentoId }: { documentoId: string }) {
  const router = useRouter();
  const doc = useLiveQuery(() => db.documentos_fiscales.get(documentoId), [documentoId]);
  const [copia, setCopia] = useState<"cliente" | "emisor">("cliente");
  const [ticket, setTicket] = useState<TicketArmado | null>(null);
  const [agente, setAgente] = useState<string | null | undefined>(undefined);

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
                Factura con CAI <span className="font-mono font-medium text-ink-900">{doc.numero_completo}</span>
              </p>
              <p>
                {doc.cliente_nombre} · <span className="font-semibold text-ink-900">L. {Number(doc.total).toFixed(2)}</span>
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-ink-500">Cargando factura…</p>
          )}
        </div>

        <div className="mt-4 flex gap-2" role="group" aria-label="Copia">
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
              etiqueta={copia === "cliente" ? "Imprimir factura (con CAI)" : "Imprimir copia del emisor"}
              onImpreso={() => {
                if (copia === "cliente") void marcarFacturaImpresa(documentoId);
              }}
            />
          ) : (
            <p className="py-4 text-center text-sm text-ink-400">Preparando la factura…</p>
          )}
        </div>

        <Button size="lg" variant="secondary" className="mt-4 w-full" type="button" onClick={cerrar}>
          Listo
        </Button>
      </div>
    </div>
  );
}
