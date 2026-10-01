"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Bike, LocateOff, MapPin, SignalLow } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { db, type DeliveryPedidoLocal } from "@/lib/offline/db";
import { canalFlota, POSICION_VIGENTE_MS } from "@/lib/delivery/seguimiento";
import { esPuntoValido } from "@/lib/location/geo";
import type { EstadoRastreo } from "@/lib/repartidor/rastreo";
import { cn } from "@/lib/ui";
import type { Marcador } from "@/components/delivery/MapaMarcadores";

const MapaMarcadores = dynamic(() => import("@/components/delivery/MapaMarcadores").then((m) => m.MapaMarcadores), {
  ssr: false,
  loading: () => <div className="h-[420px] animate-pulse rounded-2xl bg-ink-100" />,
});

interface PosicionFlota { lat: number; lng: number; t: number; ordenes: string[] }
interface RastreoFlota { estado: EstadoRastreo; segundoPlano: boolean; t: number }

const ETIQUETA_ESTADO: Record<string, string> = {
  sin_permiso: "Ubicación desactivada",
  gps_apagado: "GPS apagado",
  sin_senal: "Buscando señal de GPS",
  no_soportado: "Teléfono sin GPS",
};

const hace = (t: number, ahora: number) => {
  const s = Math.max(0, Math.round((ahora - t) / 1000));
  return s < 60 ? `hace ${s} s` : `hace ${Math.round(s / 60)} min`;
};

/**
 * Mapa de flota: los repartidores con pedidos en camino y su última posición
 * en vivo. La posición llega por Realtime broadcast (canal privado flota:<sucursal>);
 * nada de esto se guarda en la base. Se marca a quien no comparte ubicación.
 */
export function MapaFlota({ sucursalId }: { sucursalId: string }) {
  const [posiciones, setPosiciones] = useState<Record<string, PosicionFlota>>({});
  const [rastreo, setRastreo] = useState<Record<string, RastreoFlota>>({});
  const [conectado, setConectado] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());

  const pedidos = useLiveQuery(() => db.delivery_pedidos.where("sucursal_id").equals(sucursalId).filter((p) => p.estado_delivery === "en_camino").toArray(), [sucursalId], [] as DeliveryPedidoLocal[]);
  const repartidores = useLiveQuery(() => db.repartidores.where("sucursal_id").equals(sucursalId).toArray(), [sucursalId], []);
  const ordenes = useLiveQuery(async () => new Map((await db.ordenes.bulkGet(pedidos.map((p) => p.orden_id))).filter(Boolean).map((o) => [o!.id, o!])), [pedidos], new Map());

  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let canal: ReturnType<typeof supabase.channel> | null = null;
    let cancelado = false;
    void (async () => {
      // el canal es privado: se autoriza con la sesión del personal
      const { data } = await supabase.auth.getSession();
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      if (cancelado) return;
      canal = supabase
        .channel(canalFlota(sucursalId), { config: { private: true } })
        .on("broadcast", { event: "pos" }, ({ payload }) => {
          const p = payload as { repartidor_id?: string; lat?: number; lng?: number; t?: number; ordenes?: string[] };
          if (!p.repartidor_id || !esPuntoValido({ lat: p.lat, lng: p.lng })) return;
          setPosiciones((prev) => ({ ...prev, [p.repartidor_id!]: { lat: p.lat!, lng: p.lng!, t: p.t ?? Date.now(), ordenes: p.ordenes ?? [] } }));
        })
        .on("broadcast", { event: "rastreo" }, ({ payload }) => {
          const p = payload as { repartidor_id?: string; estado?: EstadoRastreo; segundo_plano?: boolean; t?: number };
          if (!p.repartidor_id || !p.estado) return;
          setRastreo((prev) => ({ ...prev, [p.repartidor_id!]: { estado: p.estado!, segundoPlano: !!p.segundo_plano, t: p.t ?? Date.now() } }));
        })
        .subscribe((estado) => setConectado(estado === "SUBSCRIBED"));
    })();
    return () => {
      cancelado = true;
      if (canal) void supabase.removeChannel(canal);
    };
  }, [sucursalId]);

  // Repartidores que llevan pedidos en la calle
  const activos = useMemo(() => {
    const ids = new Set(pedidos.map((p) => p.repartidor_id).filter(Boolean) as string[]);
    return repartidores.filter((r) => ids.has(r.id)).map((r) => ({
      r, pedidos: pedidos.filter((p) => p.repartidor_id === r.id),
    }));
  }, [pedidos, repartidores]);

  const marcadores = useMemo<Marcador[]>(() => {
    const out: Marcador[] = [];
    for (const a of activos) {
      const pos = posiciones[a.r.id];
      if (pos) out.push({ id: `r-${a.r.id}`, lat: pos.lat, lng: pos.lng, etiqueta: a.r.nombre, tipo: "repartidor", vieja: ahora - pos.t > POSICION_VIGENTE_MS });
      for (const p of a.pedidos) {
        if (p.ubicacion_lat != null && p.ubicacion_lng != null) {
          out.push({ id: `d-${p.orden_id}`, lat: p.ubicacion_lat, lng: p.ubicacion_lng, etiqueta: `#${ordenes.get(p.orden_id)?.numero_dia ?? ""} ${p.cliente_nombre}`, tipo: "destino" });
        }
      }
    }
    return out;
  }, [activos, posiciones, ordenes, ahora]);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/pos/delivery" className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100"><ArrowLeft className="h-4 w-4" /></Link>
        <div>
          <h1 className="text-lg font-semibold text-ink-900">Mapa de flota</h1>
          <p className="flex items-center gap-1.5 text-xs text-ink-500">
            <span className={cn("inline-block h-2 w-2 rounded-full", conectado ? "bg-libre-dot" : "bg-amber-400")} />
            {conectado ? "En vivo" : "Conectando…"}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <MapaMarcadores marcadores={marcadores} />
        <aside className="space-y-3">
          {activos.length === 0 && (
            <div className="rounded-2xl border border-dashed border-ink-200 p-6 text-center text-sm text-ink-400">
              <Bike className="mx-auto mb-2 h-6 w-6" /> Ningún repartidor en la calle ahora.
            </div>
          )}
          {activos.map(({ r, pedidos: ps }) => {
            const pos = posiciones[r.id];
            const st = rastreo[r.id];
            const vigente = !!pos && ahora - pos.t <= POSICION_VIGENTE_MS;
            const problema = st && st.estado !== "activo" && st.estado !== "inactivo" ? ETIQUETA_ESTADO[st.estado] : null;
            return (
              <div key={r.id} className="rounded-2xl border border-ink-100 bg-white p-3.5 shadow-card">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-900"><Bike className="h-4 w-4 text-brand-600" /> {r.nombre}</p>
                  <span className="text-xs text-ink-500">{ps.length} pedido{ps.length === 1 ? "" : "s"}</span>
                </div>
                {vigente ? (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-libre-text"><MapPin className="h-3 w-3" /> Ubicación en vivo · {hace(pos.t, ahora)}</p>
                ) : problema ? (
                  <p className="mt-1.5 flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700"><LocateOff className="h-3 w-3" /> {problema}</p>
                ) : (
                  <p className="mt-1.5 flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800"><SignalLow className="h-3 w-3" /> {pos ? `Sin señal ${hace(pos.t, ahora)}` : "Sin ubicación todavía"}</p>
                )}
                {st?.segundoPlano && <p className="mt-1 text-xs text-amber-700">App en segundo plano: la ubicación puede tardar en llegar.</p>}
                <ul className="mt-2 space-y-0.5 text-xs text-ink-600">
                  {ps.map((p) => (
                    <li key={p.orden_id}>#{ordenes.get(p.orden_id)?.numero_dia ?? "—"} · {p.cliente_nombre}{p.llegado_at ? " · llegó" : ""}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </aside>
      </div>
    </div>
  );
}
