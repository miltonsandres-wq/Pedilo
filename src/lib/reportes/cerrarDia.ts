/**
 * Reglas para poder CERRAR un día de una sucursal (función pura, para probarla). El cierre es una foto
 * que ya no cambia, así que no se deja cerrar con cosas a medias.
 */
export function problemasParaCerrar(d: {
  fecha: string; // día a cerrar (YYYY-MM-DD, hora de Honduras)
  hoy: string;
  yaCerrado: boolean;
  /** Pedidos de ese día que siguen abiertos (mesas sin cobrar). */
  pedidosAbiertos: number;
  /** Solicitudes de anulación que el administrador todavía no resuelve. */
  anulacionesPendientes: number;
}): string | null {
  if (d.fecha > d.hoy) return "No se puede cerrar un día que todavía no llega.";
  if (d.yaCerrado) return "Ese día ya está cerrado.";
  if (d.pedidosAbiertos > 0) {
    return `Hay ${d.pedidosAbiertos} ${d.pedidosAbiertos === 1 ? "pedido abierto" : "pedidos abiertos"} sin cobrar. Cóbralos o anúlalos antes de cerrar el día.`;
  }
  if (d.anulacionesPendientes > 0) {
    return `Hay ${d.anulacionesPendientes} ${d.anulacionesPendientes === 1 ? "solicitud de anulación pendiente" : "solicitudes de anulación pendientes"}. Apruébalas o recházalas antes de cerrar el día.`;
  }
  return null;
}
