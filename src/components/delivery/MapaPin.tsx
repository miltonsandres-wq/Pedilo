"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, CircleMarker } from "leaflet";
import "leaflet/dist/leaflet.css";

export interface Punto {
  lat: number;
  lng: number;
}

// Tegucigalpa: centro por omisión cuando todavía no hay pin
export const CENTRO_INICIAL: Punto = { lat: 14.0723, lng: -87.1921 };

/**
 * Mapa (Leaflet + OpenStreetMap) para que el cliente marque el punto de entrega.
 * Toque en el mapa = poner/mover el pin. Se usan círculos en vez del ícono por
 * omisión de Leaflet (que necesita imágenes sueltas y falla con el bundler).
 */
export function MapaPin({
  valor,
  onCambiar,
  alto = 220,
}: {
  valor: Punto | null;
  onCambiar: (p: Punto) => void;
  alto?: number;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<LeafletMap | null>(null);
  const marcador = useRef<CircleMarker | null>(null);
  const alCambiar = useRef(onCambiar);
  alCambiar.current = onCambiar;

  useEffect(() => {
    let vivo = true;
    void import("leaflet").then((L) => {
      if (!vivo || !contenedor.current || mapa.current) return;
      const inicio = valor ?? CENTRO_INICIAL;
      const m = L.map(contenedor.current, { zoomControl: true }).setView([inicio.lat, inicio.lng], valor ? 17 : 13);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(m);
      m.on("click", (e) => alCambiar.current({ lat: e.latlng.lat, lng: e.latlng.lng }));
      mapa.current = m;
      if (valor) {
        marcador.current = L.circleMarker([valor.lat, valor.lng], estiloPin).addTo(m);
      }
    });
    return () => {
      vivo = false;
      mapa.current?.remove();
      mapa.current = null;
      marcador.current = null;
    };
    // El mapa se crea una sola vez; los cambios de `valor` se aplican abajo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = mapa.current;
    if (!m || !valor) return;
    void import("leaflet").then((L) => {
      if (!mapa.current) return;
      if (marcador.current) marcador.current.setLatLng([valor.lat, valor.lng]);
      else marcador.current = L.circleMarker([valor.lat, valor.lng], estiloPin).addTo(mapa.current);
      mapa.current.setView([valor.lat, valor.lng], Math.max(mapa.current.getZoom(), 16));
    });
  }, [valor]);

  return <div ref={contenedor} style={{ height: alto }} className="w-full overflow-hidden rounded-xl border border-ink-200" />;
}

const estiloPin = { radius: 9, color: "#fff", weight: 3, fillColor: "#f4623a", fillOpacity: 1 };
