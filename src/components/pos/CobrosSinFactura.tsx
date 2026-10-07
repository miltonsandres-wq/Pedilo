"use client";

import { Badge } from "@/components/ui/Badge";
import { SolicitarAnulacion } from "./SolicitarAnulacion";
import { ETIQUETA_TIPO_VENTA, type VentaDia } from "@/lib/ventas/ventasDelDia";

const hora = (iso: string) =>
  new Intl.DateTimeFormat("es-HN", { hour: "2-digit", minute: "2-digit", timeZone: "America/Tegucigalpa" }).format(new Date(iso));

/** Cobros de HOY sin factura CAI (recibo no fiscal o delivery externo), con la acción de pedir su anulación. */
export function CobrosSinFactura({ ventas, puedeSolicitar }: { ventas: VentaDia[]; puedeSolicitar: boolean }) {
  return (
    <section className="mt-8" aria-label="Cobros de hoy sin factura CAI">
      <h2 className="text-base font-semibold text-ink-900">Cobros de hoy sin factura CAI</h2>
      <p className="mb-3 text-sm text-ink-500">Recibos no fiscales y delivery externo.</p>
      {ventas.length === 0 && <p className="text-sm text-ink-500">Hoy no hay cobros sin factura CAI.</p>}
      <div className="space-y-2">
        {ventas.map((v) => (
          <div key={v.ordenId} className="rounded-xl border border-ink-100 bg-white p-3.5 shadow-card">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-medium text-ink-900">
                {v.numeroDia != null ? `Orden #${v.numeroDia}` : "Cobro"}
              </span>
              <Badge tone="neutral">{ETIQUETA_TIPO_VENTA[v.tipo]}</Badge>
              {v.anulada && <Badge tone="danger">anulada</Badge>}
              <span className="ml-auto text-sm font-semibold tabular-nums text-ink-900">L. {v.total.toFixed(2)}</span>
            </div>
            <p className="mt-0.5 text-xs text-ink-500">
              {hora(v.hora)} · {v.cliente}
              {v.mesa ? ` · ${v.mesa}` : ""}
              {v.formasPago.length ? ` · ${v.formasPago.map((f) => f.replaceAll("_", " ")).join(", ")}` : ""}
            </p>
            {puedeSolicitar && !v.anulada && (
              <div className="mt-2">
                <SolicitarAnulacion ordenId={v.ordenId} documentoId={null} solicitud={v.solicitud} />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
