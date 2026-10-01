"use client";

import { AlertTriangle, LocateFixed } from "lucide-react";
import type { EstadoRastreo } from "@/lib/repartidor/rastreo";

/** Aviso permanente del estado del GPS mientras hay pedidos en camino. */
export function BannerUbicacion({
  estado, wakeLockSoportado, onReintentar,
}: {
  estado: EstadoRastreo;
  wakeLockSoportado: boolean;
  onReintentar: () => void;
}) {
  if (estado === "inactivo") return null;

  if (estado === "activo") {
    return (
      <div role="status" className="mb-3 rounded-2xl border-2 border-black bg-emerald-300 p-3 text-black">
        <p className="flex items-center gap-2 text-lg font-black"><LocateFixed className="h-5 w-5 animate-pulse" strokeWidth={3} /> Compartiendo tu ubicación</p>
        <p className="text-sm font-semibold">Mantén la app abierta{wakeLockSoportado ? "; la pantalla se queda encendida." : " y NO apagues la pantalla (este teléfono no puede mantenerla encendida solo)."}</p>
      </div>
    );
  }

  const mensajes: Record<Exclude<EstadoRastreo, "activo" | "inactivo">, string> = {
    sin_permiso: "Tu ubicación está desactivada. Puedes entregar igual, pero el restaurante y el cliente no te ven en el mapa.",
    gps_apagado: "El GPS del teléfono está apagado. Actívalo para compartir tu ubicación.",
    sin_senal: "Buscando señal de GPS… sal a un lugar abierto.",
    no_soportado: "Este teléfono no permite compartir la ubicación.",
  };
  return (
    <div role="alert" className="mb-3 rounded-2xl border-2 border-black bg-red-200 p-3 text-black">
      <p className="flex items-center gap-2 text-lg font-black"><AlertTriangle className="h-5 w-5" strokeWidth={3} /> Ubicación no disponible</p>
      <p className="text-sm font-semibold">{mensajes[estado]}</p>
      {(estado === "sin_permiso" || estado === "gps_apagado") && (
        <button type="button" onClick={onReintentar} className="mt-2 min-h-11 rounded-xl border-2 border-black bg-white px-4 font-extrabold">Reintentar</button>
      )}
    </div>
  );
}
