"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Printer } from "lucide-react";
import { db, type DocumentoFiscalLocal } from "@/lib/offline/db";
import { imprimirDocumentoFiscal } from "@/lib/fiscal/impresion";
import { formatearFechaHora } from "@/lib/fiscal/formato";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { RolUsuario } from "@/lib/types/helpers";

const ETIQUETA_CLASE: Record<string, string> = {
  factura: "Factura",
  nota_credito: "Nota de crédito",
  nota_debito: "Nota de débito",
};

/** Documentos fiscales de los últimos días de esta sucursal (viven en Dexie: sirve sin internet). */
export function ListaDocumentos({
  sucursalId,
}: {
  sucursalId: string;
  usuarioId: string;
  rol: RolUsuario;
}) {
  const docs = useLiveQuery(
    async () =>
      (await db.documentos_fiscales.where("sucursal_id").equals(sucursalId).toArray()).sort((a, b) =>
        b.fecha_emision.localeCompare(a.fecha_emision)
      ),
    [sucursalId],
    undefined as DocumentoFiscalLocal[] | undefined
  );
  const [mensajes, setMensajes] = useState<Record<string, { ok: boolean; texto: string }>>({});
  const [imprimiendo, setImprimiendo] = useState<string | null>(null);

  async function imprimir(id: string, copia: "cliente" | "emisor") {
    setImprimiendo(id);
    const r = await imprimirDocumentoFiscal(id, { copia });
    setMensajes((m) => ({ ...m, [id]: { ok: r.ok, texto: r.ok ? "Enviada a la impresora." : (r.error ?? "No se pudo imprimir.") } }));
    setImprimiendo(null);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/pos" className="mb-4 flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" strokeWidth={2} /> Volver al mapa
      </Link>
      <h1 className="text-lg font-semibold text-ink-900">Facturas emitidas</h1>
      <p className="mb-4 text-sm text-ink-500">
        Últimos 7 días. Reimprimir no consume número: la copia sale marcada «REIMPRESIÓN».
      </p>

      {docs === undefined && <p className="text-sm text-ink-500">Cargando…</p>}
      {docs?.length === 0 && <p className="text-sm text-ink-500">Todavía no hay facturas emitidas.</p>}

      <div className="space-y-2">
        {(docs ?? []).map((d) => (
          <div key={d.id} className="rounded-xl border border-ink-100 bg-white p-3.5 shadow-card">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-medium text-ink-900">{d.numero_completo}</span>
              <Badge tone="neutral">{ETIQUETA_CLASE[d.clase] ?? d.clase}</Badge>
              {d.estado === "anulada" && <Badge tone="danger">anulada</Badge>}
              {d.sync_estado === "pendiente" && <Badge tone="warning">por sincronizar</Badge>}
              {d.sync_estado === "conflicto" && <Badge tone="danger">conflicto</Badge>}
              <span className="ml-auto text-sm font-semibold tabular-nums text-ink-900">
                L. {Number(d.total).toFixed(2)}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-ink-500">
              {d.cliente_nombre}
              {d.cliente_rtn ? ` · RTN ${d.cliente_rtn}` : ""} · {formatearFechaHora(new Date(d.fecha_emision))}
            </p>
            {d.sync_estado === "conflicto" && d.sync_detalle && (
              <p className="mt-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-700">{d.sync_detalle}</p>
            )}
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" variant="secondary" disabled={imprimiendo === d.id} onClick={() => void imprimir(d.id, "cliente")}>
                <Printer className="h-3.5 w-3.5" strokeWidth={2} />
                Reimprimir
              </Button>
              <Button size="sm" variant="secondary" disabled={imprimiendo === d.id} onClick={() => void imprimir(d.id, "emisor")}>
                Copia emisor
              </Button>
              {mensajes[d.id] && (
                <span className={mensajes[d.id].ok ? "text-xs text-libre-text" : "text-xs text-red-600"}>
                  {mensajes[d.id].texto}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
