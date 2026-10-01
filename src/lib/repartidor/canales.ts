import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { canalFlota, canalPedido } from "@/lib/delivery/seguimiento";
import type { CanalesRastreo, EstadoRastreo, PedidoEnCamino } from "./rastreo";
import type { Lectura } from "@/lib/location";

/**
 * Realtime broadcast de la posición en vivo (NO escribe en la base):
 *  - `pedido:<token>`  público (el nombre secreto es el token): lo escucha el cliente;
 *  - `flota:<sucursal>` PRIVADO (política de realtime.messages, migración 0029): el restaurante.
 * Los canales se abren al primer envío y se cierran al terminar el último pedido.
 */
export function crearCanalesSupabase(
  cliente: SupabaseClient,
  info: { repartidorId: string; nombre: string; sucursalId: string }
): CanalesRastreo {
  const canales = new Map<string, RealtimeChannel>();

  function canal(nombre: string, privado: boolean) {
    let c = canales.get(nombre);
    if (!c) {
      c = cliente.channel(nombre, { config: { private: privado, broadcast: { self: false, ack: false } } });
      c.subscribe();
      canales.set(nombre, c);
    }
    return c;
  }

  return {
    publicarPosicion({ lectura, pedidos }: { lectura: Lectura; pedidos: PedidoEnCamino[] }) {
      const base = { lat: lectura.lat, lng: lectura.lng, t: lectura.t, v: lectura.velocidad };
      for (const p of pedidos) {
        void canal(canalPedido(p.token), false).send({ type: "broadcast", event: "pos", payload: base });
      }
      void canal(canalFlota(info.sucursalId), true).send({
        type: "broadcast",
        event: "pos",
        payload: { ...base, repartidor_id: info.repartidorId, nombre: info.nombre, ordenes: pedidos.map((p) => p.ordenId) },
      });
    },
    publicarEstado(estado: EstadoRastreo, segundoPlano: boolean) {
      void canal(canalFlota(info.sucursalId), true).send({
        type: "broadcast",
        event: "rastreo",
        payload: { repartidor_id: info.repartidorId, nombre: info.nombre, estado, segundo_plano: segundoPlano, t: Date.now() },
      });
    },
    cerrar() {
      for (const c of canales.values()) void cliente.removeChannel(c);
      canales.clear();
    },
  };
}
