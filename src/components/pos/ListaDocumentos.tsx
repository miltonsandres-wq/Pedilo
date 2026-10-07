"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, FilePlus2, Printer } from "lucide-react";
import { db, type DocumentoFiscalLocal } from "@/lib/offline/db";
import { imprimirDocumentoFiscal } from "@/lib/fiscal/impresion";
import { emitirNotaCredito } from "@/lib/fiscal/notasCredito";
import { formatearFechaHora } from "@/lib/fiscal/formato";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { RolUsuario } from "@/lib/types/helpers";
import { SolicitarAnulacion, type SolicitudResumen } from "./SolicitarAnulacion";

const ETIQUETA_CLASE: Record<string, string> = {
  factura: "Factura",
  nota_credito: "Nota de crédito",
  nota_debito: "Nota de débito",
};

type Mensaje = { ok: boolean; texto: string };

/**
 * Documentos fiscales de los últimos días de esta sucursal (viven en Dexie:
 * sirve sin internet). Reimprimir no consume número. El admin puede emitir una
 * nota de crédito sobre una factura vigente; anular se hace en Admin > Libro.
 */
export function ListaDocumentos({
  sucursalId,
  usuarioId,
  rol,
  solicitudes = {},
}: {
  sucursalId: string;
  usuarioId: string;
  rol: RolUsuario;
  /** Última solicitud de anulación de cada orden (la decide el administrador). */
  solicitudes?: Record<string, SolicitudResumen>;
}) {
  const docs = useLiveQuery(
    async () =>
      (await db.documentos_fiscales.where("sucursal_id").equals(sucursalId).toArray()).sort((a, b) =>
        b.fecha_emision.localeCompare(a.fecha_emision)
      ),
    [sucursalId],
    undefined as DocumentoFiscalLocal[] | undefined
  );
  const [mensajes, setMensajes] = useState<Record<string, Mensaje>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [notaPara, setNotaPara] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");

  const avisar = (id: string, m: Mensaje) => setMensajes((prev) => ({ ...prev, [id]: m }));

  async function imprimir(id: string, copia: "cliente" | "emisor") {
    setOcupado(id);
    const r = await imprimirDocumentoFiscal(id, { copia });
    avisar(id, { ok: r.ok, texto: r.ok ? "Enviada a la impresora." : (r.error ?? "No se pudo imprimir.") });
    setOcupado(null);
  }

  async function crearNota(facturaId: string) {
    setOcupado(facturaId);
    try {
      const nota = await emitirNotaCredito({ facturaId, usuarioId, motivo });
      const r = await imprimirDocumentoFiscal(nota.id);
      avisar(facturaId, {
        ok: r.ok,
        texto: r.ok
          ? `Nota de crédito ${nota.numero_completo} emitida e impresa.`
          : `Nota de crédito ${nota.numero_completo} emitida, pero no se pudo imprimir: ${r.error ?? "revisa la impresora"}. Reimprímela desde su fila.`,
      });
      setNotaPara(null);
      setMotivo("");
    } catch (e) {
      avisar(facturaId, { ok: false, texto: e instanceof Error ? e.message : "No se pudo emitir la nota de crédito." });
    } finally {
      setOcupado(null);
    }
  }

  const notaDe = (facturaId: string) =>
    (docs ?? []).find((d) => d.clase === "nota_credito" && d.estado === "emitida" && d.documento_referencia_id === facturaId);

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
        {(docs ?? []).map((d) => {
          const nota = d.clase === "factura" ? notaDe(d.id) : undefined;
          const puedeAcreditar =
            rol === "admin" && d.clase === "factura" && d.estado === "emitida" && d.sync_estado !== "conflicto" && !nota;
          const m = mensajes[d.id];
          return (
            <div key={d.id} className="rounded-xl border border-ink-100 bg-white p-3.5 shadow-card">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-medium text-ink-900">{d.numero_completo}</span>
                <Badge tone="neutral">{ETIQUETA_CLASE[d.clase] ?? d.clase}</Badge>
                {d.estado === "anulada" && <Badge tone="danger">anulada</Badge>}
                {nota && <Badge tone="warning">acreditada · {nota.numero_completo}</Badge>}
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
              {d.motivo_nota && <p className="mt-0.5 text-xs text-ink-500">Motivo: {d.motivo_nota}</p>}
              {d.sync_estado === "conflicto" && d.sync_detalle && (
                <p className="mt-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-700">{d.sync_detalle}</p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" disabled={ocupado === d.id} onClick={() => void imprimir(d.id, "cliente")}>
                  <Printer className="h-3.5 w-3.5" strokeWidth={2} />
                  Reimprimir
                </Button>
                <Button size="sm" variant="secondary" disabled={ocupado === d.id} onClick={() => void imprimir(d.id, "emisor")}>
                  Copia emisor
                </Button>
                {puedeAcreditar && notaPara !== d.id && (
                  <Button size="sm" variant="secondary" onClick={() => { setNotaPara(d.id); setMotivo(""); }}>
                    <FilePlus2 className="h-3.5 w-3.5" strokeWidth={2} />
                    Nota de crédito
                  </Button>
                )}
                {rol === "cajero" && d.clase === "factura" && d.estado === "emitida" && !nota && (
                  <SolicitarAnulacion ordenId={d.orden_id} documentoId={d.id} solicitud={solicitudes[d.orden_id]} />
                )}
                {m && <span className={m.ok ? "text-xs text-libre-text" : "text-xs text-red-600"}>{m.texto}</span>}
              </div>

              {notaPara === d.id && (
                <div className="mt-3 rounded-lg border border-ink-100 bg-ink-50/60 p-3">
                  <p className="mb-2 text-xs text-ink-600">
                    Se acredita la factura completa (L. {Number(d.total).toFixed(2)}) con un nuevo número de tu rango de notas de crédito.
                  </p>
                  <input
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Motivo (obligatorio)"
                    autoFocus
                    className="mb-2 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="danger" disabled={ocupado === d.id || !motivo.trim()} onClick={() => void crearNota(d.id)}>
                      Emitir nota de crédito
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setNotaPara(null)}>Cancelar</Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
