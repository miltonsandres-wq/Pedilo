/**
 * Datos de la venta que se imprimen en la factura además de lo fiscal: quién cobró,
 * quién atendió, dónde y cuánto/cómo se pagó. Se congelan al emitir (documentos_fiscales.detalle_venta).
 */
export interface DetalleVenta {
  cajero?: string | null;
  /** Quien tomó el pedido (mesero); solo si se conoce. */
  atendio?: string | null;
  /** Mesa, o el canal del pedido (Para llevar, Delivery…). */
  lugar?: string | null;
  /** Número de orden del día. */
  orden?: number | null;
  pagos?: { forma: string; monto: number }[];
  /** Efectivo que entregó el cliente en el último pago (solo si pagó en efectivo y lo anotó el cajero). */
  recibido?: number | null;
  /** Cambio devuelto: recibido menos lo cobrado. Solo si hubo cambio. */
  cambio?: number | null;
}

/** Clave de la config local con los nombres del equipo de la sucursal: { [usuarioId]: nombre }. */
export const CLAVE_EQUIPO = "equipo";
