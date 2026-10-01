"use client";

import { useState } from "react";
import { MapPin, MessageCircle, Navigation, Phone } from "lucide-react";
import type { PedidoRep } from "@/lib/repartidor/db";
import { enlaceGoogleMaps, enlaceLlamar, enlaceWaze, enlaceWhatsapp } from "@/lib/repartidor/enlaces";
import { calcularCambio, ETIQUETA_METODO, formatearLempiras, type MetodoPago } from "@/lib/delivery/validaciones";
import { cn } from "@/lib/ui";

const BOTON = "flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-black px-4 text-lg font-extrabold active:translate-y-px";

/**
 * Un pedido para el repartidor. Pensado para usarse al sol y con una mano:
 * letra grande, contraste alto y botones de al menos 56 px.
 */
export function TarjetaPedidoRep({
  pedido, onSali, onLlegue, onEntregar,
}: {
  pedido: PedidoRep;
  onSali: () => void;
  onLlegue: () => void;
  onEntregar: (monto: number) => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [monto, setMonto] = useState(String(pedido.total));
  const destino = { lat: pedido.destino_lat, lng: pedido.destino_lng, referencia: pedido.direccion_referencia, zona: pedido.zona_nombre };
  const cobraAlLlegar = pedido.metodo_pago !== "transferencia";
  const cambio = calcularCambio(pedido.total, pedido.paga_con);
  const montoNum = Number(monto.replace(",", "."));
  const montoValido = Number.isFinite(montoNum) && montoNum >= 0;
  const terminado = pedido.estado_delivery === "entregado";

  return (
    <article className={cn("rounded-3xl border-4 bg-white p-4 text-black", terminado ? "border-ink-300 opacity-80" : pedido.estado_delivery === "en_camino" ? "border-black" : "border-amber-400")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-3xl font-black leading-none">#{pedido.numero ?? "—"}</p>
          <p className="mt-1 text-xl font-bold">{pedido.cliente_nombre}</p>
        </div>
        <span className={cn("rounded-full px-3 py-1 text-sm font-extrabold uppercase",
          terminado ? "bg-ink-200" : pedido.estado_delivery === "en_camino" ? "bg-black text-white" : "bg-amber-300")}>
          {terminado ? "Entregado" : pedido.estado_delivery === "en_camino" ? (pedido.llegado_at ? "Llegaste" : "En camino") : "Listo para salir"}
        </span>
      </div>

      {pedido.conflicto && <p role="alert" className="mt-3 rounded-xl border-2 border-red-700 bg-red-100 p-3 text-base font-bold text-red-900">{pedido.conflicto}</p>}

      <p className="mt-3 flex items-start gap-2 text-2xl font-extrabold leading-snug">
        <MapPin className="mt-1 h-6 w-6 shrink-0" strokeWidth={3} /> <span>{pedido.direccion_referencia}</span>
      </p>
      {pedido.zona_nombre && <p className="mt-1 text-lg font-semibold text-ink-700">{pedido.zona_nombre}</p>}

      {!terminado && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a href={enlaceWaze(destino)} target="_blank" rel="noopener noreferrer" className={cn(BOTON, "bg-sky-200")}><Navigation className="h-5 w-5" /> Waze</a>
            <a href={enlaceGoogleMaps(destino)} target="_blank" rel="noopener noreferrer" className={cn(BOTON, "bg-emerald-200")}><Navigation className="h-5 w-5" /> Google Maps</a>
            <a href={enlaceLlamar(pedido.cliente_telefono)} className={cn(BOTON, "bg-white")}><Phone className="h-5 w-5" /> Llamar</a>
            <a href={enlaceWhatsapp(pedido.cliente_telefono, `Hola ${pedido.cliente_nombre}, soy tu repartidor del pedido #${pedido.numero ?? ""}`)} target="_blank" rel="noopener noreferrer" className={cn(BOTON, "bg-white")}><MessageCircle className="h-5 w-5" /> WhatsApp</a>
          </div>
          {pedido.destino_lat == null && <p className="mt-2 text-sm font-semibold text-ink-700">El cliente no marcó pin: los mapas buscan por la referencia.</p>}
        </>
      )}

      <div className="mt-4 rounded-2xl border-2 border-black bg-amber-100 p-3">
        <p className="text-sm font-bold uppercase tracking-wide">{cobraAlLlegar ? "Cobrar" : "Ya pagó por transferencia"}</p>
        <p className="text-4xl font-black tabular-nums">{formatearLempiras(pedido.total)}</p>
        <p className="text-lg font-bold">{ETIQUETA_METODO[pedido.metodo_pago as MetodoPago] ?? pedido.metodo_pago}</p>
        {pedido.metodo_pago === "efectivo" && pedido.paga_con != null && (
          <p className="mt-1 text-xl font-extrabold">Paga con {formatearLempiras(pedido.paga_con)} → lleva <span className="rounded bg-black px-2 text-white">{formatearLempiras(cambio)}</span> de cambio</p>
        )}
      </div>

      <ul className="mt-3 space-y-0.5 text-lg font-semibold">
        {pedido.items.map((i, k) => (
          <li key={k}>{i.cantidad} × {i.nombre}{i.nota ? <span className="font-normal italic"> — {i.nota}</span> : null}</li>
        ))}
      </ul>

      {!terminado && (
        <div className="mt-4 space-y-2">
          {pedido.estado_delivery === "listo" && (
            <button type="button" onClick={onSali} className={cn(BOTON, "bg-amber-300 text-2xl")}>Salí</button>
          )}
          {pedido.estado_delivery === "en_camino" && !confirmando && (
            <>
              {!pedido.llegado_at && <button type="button" onClick={onLlegue} className={cn(BOTON, "bg-white")}>Llegué</button>}
              <button type="button" onClick={() => setConfirmando(true)} className={cn(BOTON, "bg-black text-2xl text-white")}>Entregado</button>
            </>
          )}
          {pedido.estado_delivery === "en_camino" && confirmando && (
            <div className="rounded-2xl border-4 border-black p-3">
              <label htmlFor={`monto-${pedido.orden_id}`} className="text-lg font-extrabold">{cobraAlLlegar ? "¿Cuánto cobraste?" : "Monto del pedido"}</label>
              <input id={`monto-${pedido.orden_id}`} inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)}
                className="mt-1 w-full rounded-xl border-2 border-black px-3 py-3 text-3xl font-black tabular-nums" />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setConfirmando(false)} className={cn(BOTON, "bg-white")}>Volver</button>
                <button type="button" disabled={!montoValido} onClick={() => onEntregar(montoNum)} className={cn(BOTON, "bg-black text-white disabled:opacity-40")}>Confirmar</button>
              </div>
              {montoValido && Math.abs(montoNum - pedido.total) > 0.009 && cobraAlLlegar && (
                <p className="mt-2 text-sm font-bold text-red-800">Es distinto al total del pedido ({formatearLempiras(pedido.total)}). Se avisará en la liquidación.</p>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
