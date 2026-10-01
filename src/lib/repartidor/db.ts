import Dexie, { type EntityTable } from "dexie";

/**
 * Base local de la PWA del repartidor (IndexedDB propia, separada de la del POS).
 * Los cambios de estado se aplican aquí al instante y se suben por la cola
 * `acciones` cuando hay señal: el repartidor nunca espera a la red para marcar
 * "Salí" o "Entregado".
 */

export interface ItemRep {
  nombre: string;
  cantidad: number;
  nota: string | null;
}

export interface PedidoRep {
  orden_id: string;
  sucursal_id: string;
  numero: number | null;
  cliente_nombre: string;
  cliente_telefono: string;
  direccion_referencia: string;
  zona_nombre: string | null;
  destino_lat: number | null;
  destino_lng: number | null;
  metodo_pago: string;
  paga_con: number | null;
  tarifa_envio: number;
  subtotal: number;
  total: number;
  items: ItemRep[];
  estado_delivery: string;
  tracking_token: string;
  en_camino_at: string | null;
  llegado_at: string | null;
  llegada_automatica: boolean;
  entregado_at: string | null;
  monto_cobrado: number | null;
  entrega_lat: number | null;
  entrega_lng: number | null;
  /** Aviso cuando el servidor no aceptó lo que se hizo sin señal. */
  conflicto: string | null;
}

export type TipoAccionRep = "salir" | "llegar" | "entregar";

export interface AccionRep {
  id: string;
  orden_id: string;
  tipo: TipoAccionRep;
  /** Hora REAL en el teléfono (ISO): al sincronizar tarde, el servidor guarda cuándo ocurrió. */
  ts: string;
  datos: { lat?: number | null; lng?: number | null; monto?: number | null; automatica?: boolean };
  intentos: number;
  ultimo_error: string | null;
}

export type EventoRastro = "muestra" | "salida" | "llegada" | "entrega";

export interface PuntoRastroRep {
  id: string;
  orden_id: string;
  repartidor_id: string;
  lat: number;
  lng: number;
  precision_m: number | null;
  velocidad: number | null;
  evento: EventoRastro;
  registrado_at: string;
}

export interface MetaRep {
  clave: string;
  valor: unknown;
}

export interface SesionRep {
  token: string;
  exp: number; // epoch s
  repartidorId: string;
  tenantId: string;
  sucursalId: string;
  nombre: string;
  restaurante: string;
  radioLlegadaM: number;
  velocidadKmh: number;
  /** El repartidor ya vio y aceptó compartir su ubicación en este teléfono. */
  aceptoUbicacion: boolean;
}

export type BaseRepartidor = Dexie & {
  pedidos: EntityTable<PedidoRep, "orden_id">;
  acciones: EntityTable<AccionRep, "id">;
  rastro: EntityTable<PuntoRastroRep, "id">;
  meta: EntityTable<MetaRep, "clave">;
};

export function abrirBaseRepartidor(nombre = "repartidor_offline"): BaseRepartidor {
  const base = new Dexie(nombre) as BaseRepartidor;
  base.version(1).stores({
    pedidos: "orden_id, estado_delivery",
    acciones: "id, orden_id, ts",
    rastro: "id, registrado_at",
    meta: "clave",
  });
  return base;
}

export const CLAVE_SESION = "sesion";
