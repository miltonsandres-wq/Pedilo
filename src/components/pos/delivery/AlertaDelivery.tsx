"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Bike } from "lucide-react";
import { db } from "@/lib/offline/db";
import { desbloquearAudio, sonarNuevoPedido, sonidoActivado } from "@/lib/delivery/sonido";
import { cn } from "@/lib/ui";

/**
 * Acceso a delivery en la barra del POS, con el contador de pedidos NUEVOS.
 * Mientras haya alguno sin aceptar suena un timbre cada 8 s (si el sonido está
 * activado) desde CUALQUIER pantalla del POS, no solo desde el tablero.
 */
export function AlertaDelivery({ sucursalId }: { sucursalId: string }) {
  const nuevos = useLiveQuery(
    () => db.delivery_pedidos.where("sucursal_id").equals(sucursalId).filter((p) => p.estado_delivery === "recibido").count(),
    [sucursalId],
    0
  );
  const activo = useLiveQuery(async () => {
    const cfg = (await db.config.get("delivery_config"))?.valor as { activo?: boolean } | undefined;
    return !!cfg?.activo;
  }, [], false);

  // El navegador solo deja sonar tras un toque: se desbloquea con el primero
  useEffect(() => {
    const alTocar = () => desbloquearAudio();
    window.addEventListener("pointerdown", alTocar, { once: true });
    return () => window.removeEventListener("pointerdown", alTocar);
  }, []);

  useEffect(() => {
    if (nuevos === 0) return;
    const sonar = () => {
      if (sonidoActivado()) sonarNuevoPedido();
    };
    sonar();
    const id = window.setInterval(sonar, 8_000);
    return () => window.clearInterval(id);
  }, [nuevos]);

  if (!activo && nuevos === 0) {
    // Sin delivery configurado se deja el acceso discreto (para ver historial o activarlo)
    return (
      <Link href="/pos/delivery" title="Delivery" className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700">
        <Bike className="h-4 w-4" strokeWidth={2} />
      </Link>
    );
  }

  return (
    <Link
      href="/pos/delivery"
      title="Pedidos a domicilio"
      className={cn(
        "relative flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium",
        nuevos > 0 ? "animate-pulse bg-brand-600 text-white" : "text-ink-500 hover:bg-ink-100 hover:text-ink-800"
      )}
    >
      <Bike className="h-4 w-4" strokeWidth={2} />
      Delivery
      {nuevos > 0 && <span className="rounded-full bg-white px-1.5 text-[11px] font-bold tabular-nums text-brand-700">{nuevos}</span>}
    </Link>
  );
}
