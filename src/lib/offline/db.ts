import Dexie, { type EntityTable } from "dexie";
import type { EstadoMesa, EstadoOrden, FormaPago } from "@/lib/types/helpers";

/**
 * Caché local (IndexedDB) para que el POS siga funcionando sin internet.
 * Es la fuente de verdad que renderiza la UI (vía useLiveQuery); Supabase
 * Realtime + un pull inicial la mantienen al día, y el `outbox` empuja los
 * cambios del mesero/cajero hacia Supabase en cuanto vuelve la conexión.
 *
 * Los ids de orden/orden_item/pago se generan en el cliente (crypto.randomUUID)
 * para que un registro creado offline tenga YA el id definitivo: no hace
 * falta remapear nada al sincronizar.
 */

export interface MesaLocal {
  id: string;
  sucursal_id: string;
  nombre: string;
  capacidad: number;
  zona: string | null;
  pos_x: number | null;
  pos_y: number | null;
  estado: EstadoMesa;
  activa: boolean;
}

export interface ProductoLocal {
  id: string;
  sucursal_id: string; // una fila por cada sucursal donde aplica (desnormalizado del join)
  categoria_id: string | null;
  nombre: string;
  descripcion: string | null;
  precio: number;
  foto_url: string | null;
  disponible: boolean;
}

export interface OrdenLocal {
  id: string;
  sucursal_id: string;
  mesa_id: string;
  usuario_id: string | null;
  estado: EstadoOrden;
  total: number;
  cliente_nombre: string | null;
  personas: number | null;
  // Lo asigna el servidor al insertar (ver 0014_numero_orden_diario.sql), no
  // el cliente — así dos dispositivos offline nunca pueden repetir número.
  // Queda null hasta que la orden sincroniza y Realtime trae el valor real.
  numero_dia: number | null;
  // true cuando cocina la marca "lista" desde /cocina (ver 0015). Separado
  // de `estado` a propósito: no toca la lógica de cobro/liberar la mesa.
  lista_cocina: boolean;
  created_at: string;
  enviada_at: string | null;
  pagada_at: string | null;
  cancelada_at: string | null;
  motivo_cancelacion: string | null;
}

export interface OrdenItemLocal {
  id: string;
  orden_id: string;
  producto_id: string;
  nombre_producto: string;
  cantidad: number;
  precio_unitario: number;
  nota: string | null;
  impreso: boolean;
  origen_cliente: boolean;
  created_at: string;
}

export interface PagoLocal {
  id: string;
  orden_id: string;
  usuario_id: string | null;
  monto: number;
  forma_pago: FormaPago;
  referencia: string | null;
  created_at: string;
}

export type OutboxOperacion = "insert" | "update" | "delete";
export type OutboxTabla = "ordenes" | "orden_items" | "pagos" | "mesas" | "comandas";

export interface OutboxEntry {
  id: string; // uuid propio de la entrada de cola
  tabla: OutboxTabla;
  operacion: OutboxOperacion;
  registro_id: string; // id del registro afectado (para updates parciales)
  payload: Record<string, unknown>;
  creado_en: string;
  intentos: number;
  ultimo_error: string | null;
}

export interface ConfigEntry {
  clave: string;
  valor: unknown;
}

export const db = new Dexie("pos_offline") as Dexie & {
  mesas: EntityTable<MesaLocal, "id">;
  productos: EntityTable<ProductoLocal, "id">;
  ordenes: EntityTable<OrdenLocal, "id">;
  orden_items: EntityTable<OrdenItemLocal, "id">;
  pagos: EntityTable<PagoLocal, "id">;
  outbox: EntityTable<OutboxEntry, "id">;
  config: EntityTable<ConfigEntry, "clave">;
};

db.version(1).stores({
  mesas: "id, sucursal_id, estado",
  productos: "id, sucursal_id, categoria_id",
  ordenes: "id, sucursal_id, mesa_id, estado",
  orden_items: "id, orden_id, impreso",
  pagos: "id, orden_id",
  outbox: "id, tabla, creado_en",
  config: "clave",
});
