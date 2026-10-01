"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, CircleMarker } from "leaflet";
import "leaflet/dist/leaflet.css";

export interface Marcador {
  id: string;
  lat: number;
  lng: number;
  etiqueta: string;
  tipo: "repartidor" | "destino";
  /** Posición vieja (sin señal reciente): se dibuja atenuada. */
  vieja?: boolean;
}

/** Mapa con varios marcadores (flota del restaurante). Encuadra todo la primera vez que hay puntos. */
export function MapaMarcadores({ marcadores, alto = 420 }: { marcadores: Marcador[]; alto?: number }) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<LeafletMap | null>(null);
  const puestos = useRef(new Map<string, CircleMarker>());
  const encuadrado = useRef(false);

  useEffect(() => {
    let vivo = true;
    void import("leaflet").then((L) => {
      if (!vivo || !contenedor.current || mapa.current) return;
      const m = L.map(contenedor.current).setView([14.0723, -87.1921], 13);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
      mapa.current = m;
    });
    const guardados = puestos.current;
    return () => {
      vivo = false;
      mapa.current?.remove();
      mapa.current = null;
      guardados.clear();
      encuadrado.current = false;
    };
  }, []);

  useEffect(() => {
    void import("leaflet").then((L) => {
      const m = mapa.current;
      if (!m) return;
      const vigentes = new Set(marcadores.map((x) => x.id));
      for (const [id, pin] of puestos.current) {
        if (!vigentes.has(id)) {
          pin.remove();
          puestos.current.delete(id);
        }
      }
      for (const x of marcadores) {
        const estilo = x.tipo === "repartidor"
          ? { radius: 11, color: "#fff", weight: 3, fillColor: "#f4623a", fillOpacity: x.vieja ? 0.4 : 1 }
          : { radius: 8, color: "#fff", weight: 3, fillColor: "#0f172a", fillOpacity: 1 };
        const actual = puestos.current.get(x.id);
        if (actual) {
          actual.setLatLng([x.lat, x.lng]);
          actual.setStyle(estilo);
          actual.setTooltipContent(x.etiqueta);
        } else {
          const pin = L.circleMarker([x.lat, x.lng], estilo).addTo(m);
          pin.bindTooltip(x.etiqueta, { permanent: true, direction: "top", offset: [0, -8] });
          puestos.current.set(x.id, pin);
        }
      }
      if (marcadores.length > 0 && !encuadrado.current) {
        m.fitBounds(L.latLngBounds(marcadores.map((x) => [x.lat, x.lng] as [number, number])).pad(0.3), { maxZoom: 16 });
        encuadrado.current = true;
      }
    });
  }, [marcadores]);

  return <div ref={contenedor} style={{ height: alto }} className="w-full overflow-hidden rounded-2xl border border-ink-200" />;
}
