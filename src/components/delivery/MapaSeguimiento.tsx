"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, CircleMarker } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Punto } from "@/lib/location/geo";

/**
 * Mapa del seguimiento: destino fijo + repartidor moviéndose. Con un solo punto
 * se centra en él; con los dos, encuadra ambos. Se reutiliza en el mapa de
 * flota del POS (varios repartidores) pasando `extras`.
 */
export function MapaSeguimiento({
  destino,
  repartidor,
  alto = 280,
}: {
  destino: Punto | null;
  repartidor: Punto | null;
  alto?: number;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<LeafletMap | null>(null);
  const marcadores = useRef<{ destino?: CircleMarker; repartidor?: CircleMarker }>({});
  const encuadrado = useRef(false);

  useEffect(() => {
    let vivo = true;
    void import("leaflet").then((L) => {
      if (!vivo || !contenedor.current || mapa.current) return;
      const centro = repartidor ?? destino ?? { lat: 14.0723, lng: -87.1921 };
      const m = L.map(contenedor.current).setView([centro.lat, centro.lng], 15);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
      mapa.current = m;
      pintar(L);
    });
    return () => {
      vivo = false;
      mapa.current?.remove();
      mapa.current = null;
      marcadores.current = {};
      encuadrado.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pintar(L: typeof import("leaflet")) {
    const m = mapa.current;
    if (!m) return;
    const poner = (clave: "destino" | "repartidor", p: Punto | null, estilo: L.CircleMarkerOptions) => {
      const actual = marcadores.current[clave];
      if (!p) {
        actual?.remove();
        delete marcadores.current[clave];
      } else if (actual) actual.setLatLng([p.lat, p.lng]);
      else marcadores.current[clave] = L.circleMarker([p.lat, p.lng], estilo).addTo(m);
    };
    poner("destino", destino, { radius: 9, color: "#fff", weight: 3, fillColor: "#0f172a", fillOpacity: 1 });
    poner("repartidor", repartidor, { radius: 12, color: "#fff", weight: 3, fillColor: "#f4623a", fillOpacity: 1 });

    if (destino && repartidor) {
      // se encuadra una vez al tener ambos y luego solo si el repartidor se sale de la vista
      const limites = L.latLngBounds([destino.lat, destino.lng], [repartidor.lat, repartidor.lng]);
      if (!encuadrado.current || !m.getBounds().contains([repartidor.lat, repartidor.lng])) {
        m.fitBounds(limites.pad(0.3), { maxZoom: 17 });
        encuadrado.current = true;
      }
    } else if (repartidor || destino) {
      const p = (repartidor ?? destino)!;
      if (!encuadrado.current) {
        m.setView([p.lat, p.lng], 16);
        encuadrado.current = true;
      }
    }
  }

  useEffect(() => {
    void import("leaflet").then((L) => pintar(L));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destino?.lat, destino?.lng, repartidor?.lat, repartidor?.lng]);

  return <div ref={contenedor} style={{ height: alto }} className="w-full overflow-hidden rounded-2xl border border-ink-200" />;
}
