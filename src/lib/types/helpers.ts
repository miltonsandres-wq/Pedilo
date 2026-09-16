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
export type RolUsuario = "admin" | "cajero" | "mesero";
export type EstadoOrden = "abierta" | "enviada" | "pagada" | "cancelada";
export type EstadoMesa = "libre" | "ocupada";
export type FormaPago = "efectivo" | "tarjeta" | "transferencia";
