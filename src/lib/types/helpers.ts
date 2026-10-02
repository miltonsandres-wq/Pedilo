import type { Database } from "./database.types";

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];

// Los "enums" de negocio se modelaron con CHECK constraints (texto), no con
// tipos ENUM de Postgres (ver comentario en 0001_schema.sql). Los tipamos acá
// a mano para tener autocompletado en la app.
export type RolUsuario = "admin" | "cajero" | "mesero" | "cocina";
export type EstadoOrden = "abierta" | "enviada" | "pagada" | "cancelada";
export type EstadoMesa = "libre" | "ocupada";
export type FormaPago = "efectivo" | "tarjeta" | "transferencia" | "delivery_externo";

/** Cobro de un pedido que reparte una empresa externa: sin factura CAI, solo un recibo no fiscal. */
export const FORMA_DELIVERY_EXTERNO = "delivery_externo" as const;

export const ETIQUETA_FORMA_PAGO: Record<FormaPago, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  delivery_externo: "Delivery externo",
};
