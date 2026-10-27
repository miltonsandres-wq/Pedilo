"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, Check, ChefHat, Clock, MessageSquareWarning } from "lucide-react";
import { db, type OrdenLocal } from "@/lib/offline/db";
import { marcarListoCocina } from "@/lib/pos/acciones";
import { cn } from "@/lib/ui";
import { etiquetaCanal } from "@/lib/pos/canales";
import { ETIQUETA_URGENCIA, minutosDesde, nivelUrgencia, type NivelUrgencia } from "@/lib/cocina/urgencia";

/** Se re-renderiza cada 20s para que "hace X min" en las tarjetas avance solo. */
function useAhora() {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 20_000);
    return () => clearInterval(id);
  }, []);
  return ahora;
}

// Semáforo de la tarjeta: verde / ámbar / rojo. El color nunca va solo: cada nivel
// lleva también su palabra («En tiempo», «Atender», «¡Urgente!») y el crítico un ícono.
const ESTILO: Record<NivelUrgencia, { borde: string; franja: string }> = {
  fresco: { borde: "border-emerald-500", franja: "bg-emerald-700 text-white" },
  atencion: { borde: "border-amber-400", franja: "bg-amber-400 text-ink-950" },
  critico: { borde: "border-red-500", franja: "bg-red-600 text-white" },
};

export function PantallaCocina({ sucursalId }: { sucursalId: string }) {
  const ahora = useAhora();

  const ordenes = useLiveQuery(
    () =>
      db.ordenes
        .where("sucursal_id")
        .equals(sucursalId)
        .filter((o) => o.estado === "enviada" && !o.lista_cocina)
        .sortBy("enviada_at"),
    [sucursalId],
    [] as OrdenLocal[]
  );

  if (ordenes.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-ink-400">
        <ChefHat className="h-16 w-16" strokeWidth={1.5} />
        <p className="text-2xl font-semibold">Todo al día</p>
        <p className="text-base">No hay órdenes pendientes</p>
      </div>
    );
  }

  return (
    <div>
      <p className="px-4 pt-4 text-sm font-medium text-ink-400">
        {ordenes.length} {ordenes.length === 1 ? "orden pendiente" : "órdenes pendientes"} · la más antigua primero
      </p>
      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {ordenes.map((orden) => (
          <TarjetaOrden key={orden.id} orden={orden} ahora={ahora} />
        ))}
      </div>
    </div>
  );
}

function TarjetaOrden({ orden, ahora }: { orden: OrdenLocal; ahora: number }) {
  const mesa = useLiveQuery(() => (orden.mesa_id ? db.mesas.get(orden.mesa_id) : undefined), [orden.mesa_id]);
  const items = useLiveQuery(
    () => db.orden_items.where("orden_id").equals(orden.id).sortBy("created_at"),
    [orden.id],
    []
  );
  const [marcando, setMarcando] = useState(false);

  const minutos = minutosDesde(orden.enviada_at, ahora);
  const urgencia = nivelUrgencia(minutos);
  const estilo = ESTILO[urgencia];

  async function marcarListo() {
    setMarcando(true);
    await marcarListoCocina(orden.id);
  }

  // Ocultado optimista: no esperamos a que Realtime confirme el cambio para
  // que la tarjeta desaparezca — si algo falla, encolar() reintenta solo.
  if (marcando) return null;

  return (
    <div
      data-urgencia={urgencia}
      className={cn("flex flex-col overflow-hidden rounded-2xl border-4 bg-white shadow-lg", estilo.borde)}
    >
      {/* Franja del semáforo: tiempo transcurrido bien grande, legible a distancia */}
      <div className={cn("flex items-center justify-between gap-3 px-4 py-2", estilo.franja)}>
        <span className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide">
          {urgencia === "critico" && <AlertTriangle className="h-4 w-4" strokeWidth={2.5} />}
          {ETIQUETA_URGENCIA[urgencia]}
        </span>
        <span className="flex items-center gap-1.5 text-3xl font-black tabular-nums leading-none">
          <Clock className="h-6 w-6" strokeWidth={2.5} />
          {minutos} min
        </span>
      </div>

      <div className="flex items-end justify-between gap-3 border-b-2 border-ink-100 px-4 py-3">
        <p className="min-w-0 truncate text-3xl font-black leading-tight text-ink-950">
          {orden.mesa_id ? (mesa?.nombre ?? "Mesa") : etiquetaCanal(orden.canal)}
        </p>
        {orden.numero_dia != null && (
          <p className="shrink-0 rounded-lg bg-ink-900 px-2.5 py-1 font-mono text-xl font-bold text-white">
            #{orden.numero_dia}
          </p>
        )}
      </div>

      <ul className="flex-1 divide-y divide-ink-100">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-3 px-4 py-3">
            <span className="flex h-12 min-w-12 shrink-0 items-center justify-center rounded-xl bg-brand-600 px-2 text-3xl font-black tabular-nums text-white">
              {item.cantidad}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xl font-bold leading-snug text-ink-950">{item.nombre_producto}</p>
              {item.nota && (
                <p className="mt-1 flex items-start gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1.5 text-base font-semibold leading-snug text-amber-950">
                  <MessageSquareWarning className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.5} />
                  {item.nota}
                </p>
              )}
            </div>
          </li>
        ))}
        {items.length === 0 && <li className="px-4 py-3 text-base text-ink-400">Sin ítems.</li>}
      </ul>

      <button
        type="button"
        onClick={() => void marcarListo()}
        className="flex h-16 items-center justify-center gap-2 bg-emerald-600 text-2xl font-black text-white transition hover:bg-emerald-700 active:scale-[0.99]"
      >
        <Check className="h-7 w-7" strokeWidth={3} />
        Listo
      </button>
    </div>
  );
}
