/** Canal del pedido: se elige al crear el pedido (no al cobrar). */
export type CanalPedido = "local" | "para_llevar" | "delivery_web" | "delivery_telefono" | "plataforma";

export const ETIQUETA_CANAL: Record<CanalPedido, string> = {
  local: "Salón",
  para_llevar: "Para llevar",
  delivery_web: "Delivery",
  delivery_telefono: "Delivery",
  plataforma: "Plataforma",
};

export const etiquetaCanal = (canal: string | null | undefined): string =>
  ETIQUETA_CANAL[(canal ?? "local") as CanalPedido] ?? "Salón";

/** Canales que se abren desde el POS sin mesa (el delivery tiene su propio tablero y pantalla). */
export const CANALES_SIN_MESA = ["para_llevar", "plataforma"] as const;
