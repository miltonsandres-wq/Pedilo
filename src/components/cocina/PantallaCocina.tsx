"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, ChefHat, Clock } from "lucide-react";
import { db, type OrdenLocal } from "@/lib/offline/db";
import { marcarListoCocina } from "@/lib/pos/acciones";
import { cn } from "@/lib/ui";

/** Se re-renderiza cada 20s para que "hace X min" en las tarjetas avance solo. */
function useAhora() {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 20_000);
    return () => clearInterval(id);
  }, []);
  return ahora;
}

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
        <ChefHat className="h-12 w-12" strokeWidth={1.5} />
        <p className="text-lg font-medium">Todo al día — sin órdenes pendientes</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {ordenes.map((orden) => (
        <TarjetaOrden key={orden.id} orden={orden} ahora={ahora} />
      ))}
    </div>
  );
}

function TarjetaOrden({ orden, ahora }: { orden: OrdenLocal; ahora: number }) {
  const mesa = useLiveQuery(() => db.mesas.get(orden.mesa_id), [orden.mesa_id]);
  const items = useLiveQuery(
    () => db.orden_items.where("orden_id").equals(orden.id).sortBy("created_at"),
    [orden.id],
    []
  );
  const [marcando, setMarcando] = useState(false);

  const minutos = orden.enviada_at
    ? Math.max(0, Math.floor((ahora - new Date(orden.enviada_at).getTime()) / 60_000))
    : 0;
  const urgencia = minutos >= 10 ? "critico" : minutos >= 5 ? "atencion" : "fresco";

  async function marcarListo() {
    setMarcando(true);
    await marcarListoCocina(orden.id);
  }

  // Ocultado optimista: no esperamos a que Realtime confirme el cambio para
  // que la tarjeta desaparezca — si algo falla, encolar() reintenta solo.
  if (marcando) return null;

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border-2 bg-white shadow-lg",
        urgencia === "critico" && "border-red-400",
        urgencia === "atencion" && "border-amber-400",
        urgencia === "fresco" && "border-ink-100"
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between px-4 py-3",
          urgencia === "critico" && "bg-red-50",
          urgencia === "atencion" && "bg-amber-50",
          urgencia === "fresco" && "bg-ink-50"
        )}
      >
        <div>
          <p className="text-lg font-bold leading-tight text-ink-900">{mesa?.nombre ?? "Mesa"}</p>
          {orden.numero_dia != null && (
            <p className="font-mono text-xs text-ink-500">Orden #{orden.numero_dia}</p>
          )}
        </div>
        <span
          className={cn(
            "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
            urgencia === "critico" && "bg-red-500 text-white",
            urgencia === "atencion" && "bg-amber-500 text-white",
            urgencia === "fresco" && "bg-ink-200 text-ink-700"
          )}
        >
          <Clock className="h-3 w-3" strokeWidth={2.5} />
          {minutos} min
        </span>
      </div>

      <ul className="flex-1 divide-y divide-ink-100">
        {items.map((item) => (
          <li key={item.id} className="px-4 py-2.5">
            <p className="text-base font-semibold text-ink-900">
              <span className="text-brand-600">{item.cantidad}×</span> {item.nombre_producto}
            </p>
            {item.nota && <p className="mt-0.5 text-sm italic text-ink-500">* {item.nota}</p>}
          </li>
        ))}
        {items.length === 0 && <li className="px-4 py-3 text-sm text-ink-400">Sin ítems.</li>}
      </ul>

      <button
        type="button"
        onClick={() => void marcarListo()}
        className="flex items-center justify-center gap-2 bg-ink-900 py-3 text-sm font-semibold text-white transition hover:bg-ink-800"
      >
        <Check className="h-4 w-4" strokeWidth={2.5} />
        Listo
      </button>
    </div>
  );
}
