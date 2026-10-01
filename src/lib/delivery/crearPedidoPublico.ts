import { esTelefonoHN, normalizarRtn, normalizarTelefonoHN, type MetodoPago } from "./validaciones";

/**
 * Lógica del pedido público, SIN dependencias de Next, para poder probarla.
 * La server action de /[slug] solo le pasa el cliente admin y la IP.
 *
 * Lo que va aquí: honeypot, rate limit (IP y teléfono), normalización y
 * traducción de errores. Lo importante (precios, tarifa, horario, mínimo) NO
 * va aquí: lo recalcula la función SQL crear_pedido_delivery, así que aunque
 * alguien llame a esta action con un cuerpo armado a mano, no puede alterar
 * un solo precio.
 */

export interface ItemPedido {
  productoId: string;
  cantidad: number;
  nota?: string;
}

export interface PedidoPublico {
  nombre: string;
  telefono: string;
  zonaId: string;
  direccionReferencia: string;
  lat?: number | null;
  lng?: number | null;
  metodoPago: MetodoPago;
  pagaCon?: number | null;
  conRtn?: boolean;
  facturaNombre?: string;
  facturaRtn?: string;
  comprobanteUrl?: string | null;
  items: ItemPedido[];
  /** Campo trampa: un humano nunca lo llena. */
  sitioWeb?: string;
}

export type ResultadoPedidoPublico =
  | { ok: true; numero: number; trackingToken: string; subtotal: number; envio: number; total: number }
  | { ok: false; error: string };

type Respuesta = PromiseLike<{ data: unknown; error: { message: string } | null }>;

/** Lo mínimo que se usa del cliente admin de Supabase (así se puede probar con un doble). */
export interface ClienteAdminMinimo {
  rpc(fn: string, args: Record<string, unknown>): Respuesta;
  from(tabla: string): {
    select(cols: string): {
      eq(col: string, val: string): { maybeSingle(): Respuesta };
    };
  };
}

export const LIMITES = {
  porIp: { max: 12, ventanaSeg: 600 },
  porTelefono: { max: 4, ventanaSeg: 600 },
} as const;

const ERROR_GENERICO = "No pudimos registrar tu pedido. Intenta de nuevo en un momento.";

/** "DELIVERY_MINIMO: el monto mínimo..." -> "el monto mínimo..." (cualquier otro error se esconde). */
export function mensajeDeError(mensaje: string): string {
  const m = /DELIVERY_[A-Z_]+: ([^\n]+)/.exec(mensaje);
  if (!m) return ERROR_GENERICO;
  const texto = m[1].trim();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

async function permitido(admin: ClienteAdminMinimo, clave: string, max: number, ventanaSeg: number) {
  const { data, error } = await admin.rpc("delivery_rate_limit_hit", {
    p_clave: clave,
    p_max: max,
    p_ventana_seg: ventanaSeg,
  });
  // Si el contador falla, mejor dejar pasar el pedido que perder una venta
  if (error) return true;
  return data !== false;
}

export async function procesarPedidoPublico(
  admin: ClienteAdminMinimo,
  slug: string,
  ip: string,
  pedido: PedidoPublico
): Promise<ResultadoPedidoPublico> {
  // Honeypot: respondemos como si fallara algo genérico, sin pista de por qué
  if (pedido.sitioWeb && pedido.sitioWeb.trim() !== "") return { ok: false, error: ERROR_GENERICO };

  const telefono = normalizarTelefonoHN(pedido.telefono ?? "");
  if (!esTelefonoHN(telefono)) return { ok: false, error: "El teléfono debe tener 8 dígitos (ej. 9988-7766)" };

  if (!(await permitido(admin, `ip:${ip}`, LIMITES.porIp.max, LIMITES.porIp.ventanaSeg))) {
    return { ok: false, error: "Hiciste demasiados intentos. Espera unos minutos e inténtalo otra vez." };
  }
  if (!(await permitido(admin, `tel:${telefono}`, LIMITES.porTelefono.max, LIMITES.porTelefono.ventanaSeg))) {
    return { ok: false, error: "Ya enviaste varios pedidos con este teléfono. Espera unos minutos o llámanos." };
  }

  const { data: config } = await admin.from("delivery_config").select("sucursal_id").eq("slug", slug).maybeSingle();
  const sucursalId = (config as { sucursal_id?: string } | null)?.sucursal_id;
  if (!sucursalId) return { ok: false, error: "Este restaurante no existe." };

  const { data, error } = await admin.rpc("crear_pedido_delivery", {
    p_sucursal: sucursalId,
    p_canal: "delivery_web",
    p_pedido: {
      nombre: pedido.nombre,
      telefono,
      zona_id: pedido.zonaId,
      direccion_referencia: pedido.direccionReferencia,
      lat: pedido.lat ?? null,
      lng: pedido.lng ?? null,
      metodo_pago: pedido.metodoPago,
      paga_con: pedido.metodoPago === "efectivo" ? (pedido.pagaCon ?? null) : null,
      tipo_factura: pedido.conRtn ? "con_rtn" : "consumidor_final",
      factura_nombre: pedido.conRtn ? pedido.facturaNombre : null,
      factura_rtn: pedido.conRtn ? normalizarRtn(pedido.facturaRtn ?? "") : null,
      comprobante_url: pedido.comprobanteUrl ?? null,
      // Solo se mandan ids y cantidades: el servidor pone nombre y precio
      items: pedido.items.map((i) => ({ producto_id: i.productoId, cantidad: i.cantidad, nota: i.nota ?? null })),
    },
  });
  if (error) return { ok: false, error: mensajeDeError(error.message) };

  const r = data as { numero: number; tracking_token: string; subtotal: number; envio: number; total: number };
  return { ok: true, numero: r.numero, trackingToken: r.tracking_token, subtotal: r.subtotal, envio: r.envio, total: r.total };
}
