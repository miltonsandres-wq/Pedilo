"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Bike, Check, FileDown, MapPin, MessageCircle, Phone } from "lucide-react";
import { obtenerSeguimiento } from "@/app/[slug]/pedido/[token]/actions";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/ui";
import { esPuntoValido, textoDistancia } from "@/lib/location/geo";
import {
  calcularEta, canalPedido, construirLinea, esFinal, linkWhatsappTelefono, posicionVigente,
  puedeVerUbicacionRepartidor, ETIQUETA_ESTADO, type PosicionRepartidor, type Seguimiento,
} from "@/lib/delivery/seguimiento";
import { ETIQUETA_METODO, formatearLempiras, type MetodoPago } from "@/lib/delivery/validaciones";

const MapaSeguimiento = dynamic(() => import("./MapaSeguimiento").then((m) => m.MapaSeguimiento), {
  ssr: false,
  loading: () => <div className="h-[280px] animate-pulse rounded-2xl bg-ink-100" />,
});

const hora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("es-HN", { hour: "2-digit", minute: "2-digit", timeZone: "America/Tegucigalpa" }) : null;

/** Refresco de respaldo: el aviso de Realtime lo hace instantáneo, esto cubre una señal caída. */
const REFRESCO_MS = 15_000;

export function SeguimientoPedido({ slug, token, inicial }: { slug: string; token: string; inicial: Seguimiento }) {
  const [seg, setSeg] = useState<Seguimiento>(inicial);
  const [pos, setPos] = useState<PosicionRepartidor | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const estadoRef = useRef(seg.estado);
  estadoRef.current = seg.estado;

  const refrescar = useCallback(async () => {
    const nuevo = await obtenerSeguimiento(slug, token).catch(() => null);
    if (nuevo) setSeg(nuevo);
  }, [slug, token]);

  // Privacidad: fuera de "en camino" no queda ninguna ubicación en pantalla
  useEffect(() => {
    if (!puedeVerUbicacionRepartidor(seg.estado)) setPos(null);
  }, [seg.estado]);

  useEffect(() => {
    if (esFinal(seg.estado)) return;
    const id = window.setInterval(() => void refrescar(), REFRESCO_MS);
    const alVolver = () => document.visibilityState === "visible" && void refrescar();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [seg.estado, refrescar]);

  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 10_000);
    return () => window.clearInterval(id);
  }, []);

  // Realtime broadcast: aviso de cambio de estado + posición del repartidor
  useEffect(() => {
    const supabase = createClient();
    const canal = supabase
      .channel(canalPedido(token))
      .on("broadcast", { event: "estado" }, () => void refrescar())
      .on("broadcast", { event: "pos" }, ({ payload }) => {
        // se ignora lo que llegue si el pedido no va en camino
        if (!puedeVerUbicacionRepartidor(estadoRef.current)) return;
        const p = payload as { lat?: number; lng?: number; t?: number; v?: number | null };
        if (!esPuntoValido({ lat: p.lat, lng: p.lng })) return;
        setPos({ lat: p.lat!, lng: p.lng!, t: typeof p.t === "number" ? p.t : Date.now(), velocidad: p.v ?? null });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [token, refrescar]);

  const linea = construirLinea(seg);
  const enCamino = seg.estado === "en_camino";
  const vivo = enCamino && posicionVigente(pos, ahora);
  const eta = vivo ? calcularEta(pos, seg.destino, seg.velocidad_kmh) : null;
  const cancelado = seg.estado === "rechazado" || seg.estado === "cancelado";

  return (
    <div className="min-h-screen bg-ink-50 pb-10">
      <header className="border-b border-ink-100 bg-white px-5 py-5 text-center">
        <p className="text-xs text-ink-500">{seg.sucursal}</p>
        <h1 className="mt-1 text-lg font-semibold text-ink-900">Tu pedido #{seg.numero ?? "—"}</h1>
        <span className={cn("mt-2 inline-block rounded-full px-3 py-1 text-xs font-semibold",
          cancelado ? "bg-red-100 text-red-700" : seg.estado === "entregado" ? "bg-libre-bg text-libre-text" : "bg-brand-100 text-brand-700")}>
          {ETIQUETA_ESTADO[seg.estado]}
        </span>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 py-5">
        {cancelado && (
          <div role="alert" className="flex gap-2.5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">{seg.estado === "rechazado" ? "El restaurante no pudo aceptar tu pedido" : "Tu pedido fue cancelado"}</p>
              {seg.motivo && <p className="mt-0.5">Motivo: {seg.motivo}</p>}
              <p className="mt-1 text-xs text-red-700">Puedes volver a pedir desde el menú.</p>
            </div>
          </div>
        )}

        {enCamino && seg.llegado_at && (
          <div role="status" className="flex items-center gap-2.5 rounded-2xl border border-libre-border bg-libre-bg p-4 text-sm font-medium text-libre-text">
            <MapPin className="h-5 w-5" /> ¡Tu repartidor llegó! Sal a recibir tu pedido.
          </div>
        )}

        {!cancelado && (
          <ol className="rounded-2xl border border-ink-100 bg-white p-4 shadow-card">
            {linea.map((p, i) => (
              <li key={p.estado} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={cn("flex h-6 w-6 items-center justify-center rounded-full border-2 text-white",
                    p.situacion === "hecho" && "border-libre-dot bg-libre-dot",
                    p.situacion === "actual" && "border-brand-600 bg-brand-600",
                    p.situacion === "pendiente" && "border-ink-200 bg-white")}>
                    {p.situacion === "hecho" ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : p.situacion === "actual" ? <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> : null}
                  </span>
                  {i < linea.length - 1 && <span className={cn("my-0.5 w-0.5 flex-1", p.situacion === "hecho" ? "bg-libre-dot" : "bg-ink-200")} style={{ minHeight: 18 }} />}
                </div>
                <div className="flex flex-1 items-start justify-between pb-3">
                  <p className={cn("text-sm", p.situacion === "pendiente" ? "text-ink-400" : "font-medium text-ink-900")}>{p.titulo}</p>
                  <p className="text-xs tabular-nums text-ink-400">{hora(p.hora)}</p>
                </div>
              </li>
            ))}
          </ol>
        )}

        {enCamino && (
          <section className="space-y-3">
            {seg.repartidor && (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-ink-100 bg-white p-4 shadow-card">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-700"><Bike className="h-5 w-5" /></span>
                  <div>
                    <p className="text-sm font-semibold text-ink-900">{seg.repartidor.nombre}</p>
                    <p className="text-xs text-ink-500">Tu repartidor</p>
                  </div>
                </div>
                {seg.repartidor.telefono && (
                  <div className="flex gap-2">
                    <a href={`tel:${seg.repartidor.telefono}`} aria-label="Llamar al repartidor"
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-ink-200 text-ink-700"><Phone className="h-4 w-4" /></a>
                    <a href={linkWhatsappTelefono(seg.repartidor.telefono, `Hola, soy el cliente del pedido #${seg.numero}`)} target="_blank" rel="noopener noreferrer"
                      aria-label="Escribirle por WhatsApp" className="flex h-10 w-10 items-center justify-center rounded-full border border-ink-200 text-libre-text"><MessageCircle className="h-4 w-4" /></a>
                  </div>
                )}
              </div>
            )}

            {(vivo || seg.destino) && <MapaSeguimiento destino={seg.destino} repartidor={vivo ? pos : null} />}

            <p className="text-center text-sm text-ink-600" role="status">
              {eta ? (
                <>Llega en aproximadamente <b>{eta.minutos} min</b> · a {textoDistancia(eta.distanciaM)} de ti</>
              ) : vivo ? (
                "Tu repartidor va en camino."
              ) : (
                "Esperando la ubicación de tu repartidor…"
              )}
            </p>
          </section>
        )}

        <section className="rounded-2xl border border-ink-100 bg-white p-4 text-sm shadow-card">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Tu pedido</p>
          <div className="space-y-1">
            {seg.items.map((i, k) => (
              <div key={k} className="flex justify-between text-ink-700">
                <span>{i.cantidad} × {i.nombre}</span>
                <span className="tabular-nums">{formatearLempiras(i.cantidad * i.precio)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-1 border-t border-ink-100 pt-3 text-ink-600">
            <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{formatearLempiras(seg.subtotal)}</span></div>
            <div className="flex justify-between"><span>Envío{seg.zona ? ` (${seg.zona})` : ""}</span><span className="tabular-nums">{formatearLempiras(seg.envio)}</span></div>
            <div className="flex justify-between text-base font-semibold text-ink-900"><span>Total</span><span className="tabular-nums">{formatearLempiras(seg.total)}</span></div>
            <p className="pt-1 text-xs text-ink-400">Pago: {ETIQUETA_METODO[seg.metodo_pago as MetodoPago] ?? seg.metodo_pago}</p>
          </div>
          <p className="mt-3 border-t border-ink-100 pt-3 text-xs text-ink-500">Entrega: {seg.direccion_referencia}</p>
        </section>

        {seg.factura && (
          <a href={`/${slug}/pedido/${token}/factura`}
            className="flex items-center justify-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm font-medium text-ink-800 shadow-card hover:bg-ink-50">
            <FileDown className="h-4 w-4" /> Descargar factura {seg.factura.numero} (PDF)
          </a>
        )}

        <p className="text-center text-xs text-ink-400">
          Esta página se actualiza sola.{!esFinal(seg.estado) && ` Tiempo estimado: ~${seg.tiempo_estimado_min} min.`}
        </p>
      </main>
    </div>
  );
}
