"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2 } from "lucide-react";
import { solicitarAnulacion } from "@/app/pos/documentos/actions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export interface SolicitudResumen {
  orden_id: string;
  estado: "pendiente" | "aprobada" | "rechazada";
  motivo: string;
  respuesta: string | null;
}

/**
 * El cajero PIDE anular una venta y explica por qué; la anulación no se hace hasta que el
 * administrador la aprueba (Admin > Facturas). Muestra en qué va la solicitud.
 */
export function SolicitarAnulacion({
  ordenId,
  documentoId,
  solicitud,
}: {
  ordenId: string;
  documentoId: string | null;
  solicitud?: SolicitudResumen | null;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  // Tras enviarla se muestra «pendiente» al instante, sin esperar a que la pantalla se refresque
  const [enviada, setEnviada] = useState(false);

  async function enviar() {
    setEnviando(true);
    setMensaje(null);
    try {
      const r = await solicitarAnulacion({ ordenId, documentoId, motivo });
      if (r.ok) {
        setEnviada(true);
        setAbierto(false);
        setMotivo("");
        router.refresh();
      } else {
        setMensaje({ ok: false, texto: r.error });
      }
    } catch {
      setMensaje({ ok: false, texto: "No se pudo enviar. Revisa tu conexión e inténtalo de nuevo." });
    } finally {
      setEnviando(false);
    }
  }

  if (solicitud?.estado === "aprobada") return <Badge tone="danger">anulación aprobada</Badge>;
  if (enviada || solicitud?.estado === "pendiente") {
    return <Badge tone="warning">anulación pendiente de aprobación</Badge>;
  }

  return (
    <div className="w-full">
      {solicitud?.estado === "rechazada" && (
        <p className="mb-1.5 rounded-lg bg-ink-50 px-2.5 py-1.5 text-xs text-ink-600">
          El administrador rechazó tu solicitud{solicitud.respuesta ? `: ${solicitud.respuesta}` : "."}
        </p>
      )}
      {!abierto ? (
        <Button size="sm" variant="secondary" onClick={() => setAbierto(true)}>
          <Ban className="h-3.5 w-3.5" strokeWidth={2} />
          {solicitud?.estado === "rechazada" ? "Volver a solicitar anulación" : "Solicitar anulación"}
        </Button>
      ) : (
        <div className="rounded-lg border border-ink-100 bg-ink-50/60 p-3">
          <p className="mb-2 text-xs text-ink-600">
            Explica por qué se debe anular. <b>El administrador tiene que aprobarla</b>: hasta entonces la venta sigue vigente.
          </p>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo (obligatorio). Ej. se cobró dos veces, error de monto…"
            rows={2}
            maxLength={300}
            autoFocus
            aria-label="Motivo de la anulación"
            className="mb-2 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
          {mensaje && !mensaje.ok && <p role="alert" className="mb-2 text-xs text-red-600">{mensaje.texto}</p>}
          <div className="flex gap-2">
            <Button size="sm" variant="danger" disabled={enviando || motivo.trim().length < 5} onClick={() => void enviar()}>
              {enviando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Enviar solicitud
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAbierto(false)} disabled={enviando}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
