import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";
import type { AccionRep, PedidoRep, PuntoRastroRep, SesionRep } from "./db";

/**
 * Lo que la PWA le pide al servidor. Es una interfaz a propósito: la sincronización
 * offline (sync.ts) solo habla con esto, así se prueba contra una base real
 * (PGlite con RLS) sin tocar la red, y la implementación de Supabase queda aislada.
 */

export type RespuestaPedidos = { ok: true; pedidos: PedidoRep[] } | { ok: false; error: string };
export type RespuestaEscritura = { ok: true } | { ok: false; permanente: boolean; error: string };

export interface ApiRepartidor {
  /** Pedidos asignados a este repartidor, sin liquidar (RLS: solo los suyos). */
  traerPedidos(): Promise<RespuestaPedidos>;
  enviarAccion(accion: AccionRep): Promise<RespuestaEscritura>;
  subirRastro(puntos: PuntoRastroRep[]): Promise<RespuestaEscritura>;
  aceptarUbicacion(): Promise<boolean>;
  /** false cuando el turno ya se liquidó (se debe cerrar la sesión); null si no se pudo saber. */
  turnoActivo?(): Promise<boolean | null>;
}

/**
 * ¿El rechazo del servidor es definitivo (reintentar no sirve) o transitorio
 * (sin señal, caída)? Las reglas de negocio (DELIVERY_*, RASTRO_*), la RLS y los
 * CHECK son definitivos; todo lo demás se reintenta.
 */
export function esRechazoPermanente(mensaje: string): boolean {
  return /DELIVERY_|RASTRO_|row-level security|violates|invalid input|permission denied/i.test(mensaje);
}

/** Cambios que una acción hace sobre ordenes_delivery (el servidor valida la transición). */
export function cambiosDeAccion(a: AccionRep): Record<string, unknown> {
  switch (a.tipo) {
    case "salir":
      return { estado_delivery: "en_camino", en_camino_at: a.ts };
    case "llegar":
      return { llegado_at: a.ts, llegada_automatica: !!a.datos.automatica };
    case "entregar":
      return {
        estado_delivery: "entregado",
        entregado_at: a.ts,
        monto_cobrado: a.datos.monto ?? null,
        entrega_lat: a.datos.lat ?? null,
        entrega_lng: a.datos.lng ?? null,
      };
  }
}

interface FilaPedido {
  orden_id: string;
  sucursal_id: string;
  cliente_nombre: string;
  cliente_telefono: string;
  direccion_referencia: string;
  zona_nombre: string | null;
  ubicacion_lat: number | null;
  ubicacion_lng: number | null;
  metodo_pago: string;
  paga_con: number | null;
  tarifa_envio: number;
  estado_delivery: string;
  tracking_token: string;
  en_camino_at: string | null;
  llegado_at: string | null;
  llegada_automatica: boolean;
  entregado_at: string | null;
  monto_cobrado: number | null;
  entrega_lat: number | null;
  entrega_lng: number | null;
  ordenes: { numero_dia: number | null; total: number } | null;
}

export function filaAPedido(f: FilaPedido, items: { nombre: string; cantidad: number; nota: string | null }[]): PedidoRep {
  const subtotal = Number(f.ordenes?.total ?? 0);
  return {
    orden_id: f.orden_id,
    sucursal_id: f.sucursal_id,
    numero: f.ordenes?.numero_dia ?? null,
    cliente_nombre: f.cliente_nombre,
    cliente_telefono: f.cliente_telefono,
    direccion_referencia: f.direccion_referencia,
    zona_nombre: f.zona_nombre,
    destino_lat: f.ubicacion_lat,
    destino_lng: f.ubicacion_lng,
    metodo_pago: f.metodo_pago,
    paga_con: f.paga_con != null ? Number(f.paga_con) : null,
    tarifa_envio: Number(f.tarifa_envio),
    subtotal,
    total: Math.round((subtotal + Number(f.tarifa_envio)) * 100) / 100,
    items,
    estado_delivery: f.estado_delivery,
    tracking_token: f.tracking_token,
    en_camino_at: f.en_camino_at,
    llegado_at: f.llegado_at,
    llegada_automatica: f.llegada_automatica,
    entregado_at: f.entregado_at,
    monto_cobrado: f.monto_cobrado != null ? Number(f.monto_cobrado) : null,
    entrega_lat: f.entrega_lat,
    entrega_lng: f.entrega_lng,
    conflicto: null,
  };
}

/** Cliente de Supabase que habla como el repartidor (su JWT propio, rol authenticated). */
export function crearClienteRepartidor(sesion: Pick<SesionRep, "token">) {
  const cliente = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${sesion.token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  // Realtime (canal privado de la flota) también necesita el token del repartidor
  cliente.realtime.setAuth(sesion.token);
  return cliente;
}

export function crearApiSupabase(sesion: Pick<SesionRep, "token">): ApiRepartidor {
  const sb = crearClienteRepartidor(sesion);

  return {
    async traerPedidos() {
      const { data, error } = await sb
        .from("ordenes_delivery")
        .select("*, ordenes(numero_dia, total)")
        .in("estado_delivery", ["listo", "en_camino", "entregado"])
        .is("liquidacion_id", null);
      if (error) return { ok: false, error: error.message };
      const filas = (data ?? []) as unknown as FilaPedido[];
      const ids = filas.map((f) => f.orden_id);
      const porOrden = new Map<string, { nombre: string; cantidad: number; nota: string | null }[]>();
      if (ids.length) {
        const { data: items, error: errItems } = await sb
          .from("orden_items")
          .select("orden_id, nombre_producto, cantidad, nota")
          .in("orden_id", ids);
        if (errItems) return { ok: false, error: errItems.message };
        for (const i of items ?? []) {
          const lista = porOrden.get(i.orden_id) ?? [];
          lista.push({ nombre: i.nombre_producto, cantidad: i.cantidad, nota: i.nota });
          porOrden.set(i.orden_id, lista);
        }
      }
      return { ok: true, pedidos: filas.map((f) => filaAPedido(f, porOrden.get(f.orden_id) ?? [])) };
    },

    async enviarAccion(a) {
      const { data, error } = await sb
        .from("ordenes_delivery")
        .update(cambiosDeAccion(a) as never)
        .eq("orden_id", a.orden_id)
        .select("orden_id");
      if (error) return { ok: false, permanente: esRechazoPermanente(error.message), error: error.message };
      // RLS: un pedido que no es suyo (o ya no) no actualiza ninguna fila
      if (!data || data.length === 0) return { ok: false, permanente: true, error: "El pedido ya no está asignado a ti." };
      return { ok: true };
    },

    async subirRastro(puntos) {
      const { error } = await sb.from("repartidor_rastro").upsert(
        puntos.map((p) => ({
          orden_id: p.orden_id, repartidor_id: p.repartidor_id, lat: p.lat, lng: p.lng,
          precision_m: p.precision_m, velocidad: p.velocidad, evento: p.evento, registrado_at: p.registrado_at,
        })) as never,
        { onConflict: "orden_id,registrado_at,evento", ignoreDuplicates: true }
      );
      if (error) return { ok: false, permanente: esRechazoPermanente(error.message), error: error.message };
      return { ok: true };
    },

    async turnoActivo() {
      const { data, error } = await sb.from("repartidores").select("turno_inicio, activo").maybeSingle();
      if (error || !data) return null;
      return data.activo && data.turno_inicio != null;
    },

    async aceptarUbicacion() {
      const { error } = await sb.rpc("repartidor_aceptar_ubicacion");
      return !error;
    },
  };
}
