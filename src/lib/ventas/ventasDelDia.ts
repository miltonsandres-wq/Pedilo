/**
 * Ventas del día clasificadas por tipo de comprobante. Son funciones puras (sin base de datos)
 * para poder probarlas: `cargarVentasDelDia` (servidor) trae los datos y las usa.
 *
 *  - con_cai:     la orden tiene una factura fiscal (con CAI), vigente o anulada
 *  - sin_factura: cobro de «Delivery externo» (no lleva factura; solo recibo no fiscal)
 *  - sin_cai:     el resto de cobros sin factura fiscal (negocio sin CAI, recibo no fiscal)
 */

export type TipoVenta = "con_cai" | "sin_cai" | "sin_factura";
export type EstadoSolicitud = "pendiente" | "aprobada" | "rechazada";

export const ETIQUETA_TIPO_VENTA: Record<TipoVenta, string> = {
  con_cai: "Con CAI",
  sin_cai: "Sin CAI",
  sin_factura: "Sin factura",
};

export interface OrdenPagada {
  id: string;
  sucursal_id: string;
  mesa_id: string | null;
  numero_dia: number | null;
  cliente_nombre: string | null;
  total: number;
  pagada_at: string;
}
export interface PagoVenta {
  orden_id: string;
  forma_pago: string;
  monto: number;
}
export interface FacturaVenta {
  id: string;
  orden_id: string;
  numero_completo: string;
  cliente_nombre: string;
  cliente_rtn: string | null;
  total: number;
  estado: "emitida" | "anulada";
  anulada_motivo: string | null;
}
export interface SolicitudVenta {
  id: string;
  orden_id: string;
  estado: EstadoSolicitud;
  motivo: string;
  respuesta: string | null;
  created_at: string;
}

export interface VentaDia {
  ordenId: string;
  sucursalId: string;
  mesa: string | null;
  numeroDia: number | null;
  hora: string;
  cliente: string;
  tipo: TipoVenta;
  documentoId: string | null;
  numeroFactura: string | null;
  formasPago: string[];
  total: number;
  /** La factura está anulada o se aprobó anular este cobro. */
  anulada: boolean;
  motivoAnulacion: string | null;
  /** Última solicitud de anulación de caja (si hay). */
  solicitud: SolicitudVenta | null;
}

export function clasificarVentas(datos: {
  ordenes: OrdenPagada[];
  pagos: PagoVenta[];
  facturas: FacturaVenta[];
  solicitudes: SolicitudVenta[];
  mesas: Map<string, string>;
}): VentaDia[] {
  const facturaPorOrden = new Map(datos.facturas.map((f) => [f.orden_id, f]));
  const ventas = datos.ordenes.map((o): VentaDia => {
    const factura = facturaPorOrden.get(o.id) ?? null;
    const formas = [...new Set(datos.pagos.filter((p) => p.orden_id === o.id).map((p) => p.forma_pago))];
    const solicitudes = datos.solicitudes
      .filter((s) => s.orden_id === o.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const solicitud = solicitudes[0] ?? null;
    const aprobada = solicitudes.find((s) => s.estado === "aprobada") ?? null;

    const tipo: TipoVenta = factura ? "con_cai" : formas.includes("delivery_externo") ? "sin_factura" : "sin_cai";
    const anulada = factura?.estado === "anulada" || !!aprobada;
    return {
      ordenId: o.id,
      sucursalId: o.sucursal_id,
      mesa: o.mesa_id ? (datos.mesas.get(o.mesa_id) ?? null) : null,
      numeroDia: o.numero_dia,
      hora: o.pagada_at,
      cliente: factura?.cliente_nombre ?? o.cliente_nombre ?? "—",
      tipo,
      documentoId: factura?.id ?? null,
      numeroFactura: factura?.numero_completo ?? null,
      formasPago: formas,
      total: Number(factura?.total ?? o.total),
      anulada,
      motivoAnulacion: factura?.anulada_motivo ?? aprobada?.motivo ?? null,
      solicitud,
    };
  });
  return ventas.sort((a, b) => b.hora.localeCompare(a.hora));
}

export interface ResumenVentas {
  porTipo: Record<TipoVenta, { cantidad: number; total: number }>;
  anuladas: { cantidad: number; total: number };
  /** Lo vendido sin contar lo anulado. */
  neto: { cantidad: number; total: number };
}

const redondear = (n: number) => Math.round(n * 100) / 100;

export function resumirVentas(ventas: VentaDia[]): ResumenVentas {
  const porTipo: ResumenVentas["porTipo"] = {
    con_cai: { cantidad: 0, total: 0 },
    sin_cai: { cantidad: 0, total: 0 },
    sin_factura: { cantidad: 0, total: 0 },
  };
  const anuladas = { cantidad: 0, total: 0 };
  for (const v of ventas) {
    if (v.anulada) {
      anuladas.cantidad += 1;
      anuladas.total += v.total;
      continue; // lo anulado no cuenta en los totales por tipo
    }
    porTipo[v.tipo].cantidad += 1;
    porTipo[v.tipo].total += v.total;
  }
  for (const t of Object.values(porTipo)) t.total = redondear(t.total);
  anuladas.total = redondear(anuladas.total);
  const neto = {
    cantidad: Object.values(porTipo).reduce((a, t) => a + t.cantidad, 0),
    total: redondear(Object.values(porTipo).reduce((a, t) => a + t.total, 0)),
  };
  return { porTipo, anuladas, neto };
}

/** Rango [00:00, 23:59:59.999] del día `fecha` (YYYY-MM-DD) en hora de Honduras (UTC-6, sin horario de verano). */
export function rangoDiaHN(fecha: string): { desde: string; hasta: string } {
  return {
    desde: new Date(`${fecha}T00:00:00-06:00`).toISOString(),
    hasta: new Date(`${fecha}T23:59:59.999-06:00`).toISOString(),
  };
}

/** Acepta solo YYYY-MM-DD válido; si no, devuelve `porDefecto`. */
export function fechaValida(valor: string | undefined, porDefecto: string): string {
  return valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(`${valor}T00:00:00Z`)) ? valor : porDefecto;
}
