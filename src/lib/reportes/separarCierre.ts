/**
 * Cierre de caja separado: lo FACTURADO (tiene factura con CAI vigente) por un lado y lo NO FACTURADO
 * (tickets sin factura) por otro, cada uno con sus métodos de pago. Lo anulado va aparte y no suma a
 * ninguno. Si se suman los tres bloques sale exactamente lo cobrado: `cuadra` lo comprueba.
 */

export interface PagoCierre {
  orden_id: string;
  forma_pago: string;
  monto: number;
}

export interface BloqueCierre {
  /** Órdenes distintas que entran en el bloque. */
  cantidad: number;
  total: number;
  porFormaPago: Record<string, number>;
}

export interface CierreSeparado {
  facturado: BloqueCierre;
  noFacturado: BloqueCierre;
  anulado: BloqueCierre;
  /** facturado + no facturado + anulado == total de los pagos del día (al centavo). */
  cuadra: boolean;
}

const centavos = (n: number) => Math.round(n * 100) / 100;
const vacio = (): BloqueCierre => ({ cantidad: 0, total: 0, porFormaPago: {} });

export function separarCierre(
  pagos: PagoCierre[],
  /** Estado de la factura con CAI de cada orden (las que no tienen factura no aparecen). */
  facturaPorOrden: Map<string, "emitida" | "anulada">,
  /** Órdenes cuya anulación el administrador aprobó (cobros sin factura anulados). */
  anuladasPorSolicitud: Set<string> = new Set()
): CierreSeparado {
  const bloques = { facturado: vacio(), noFacturado: vacio(), anulado: vacio() };
  const ordenes = { facturado: new Set<string>(), noFacturado: new Set<string>(), anulado: new Set<string>() };
  let totalPagos = 0;
  const porFormaTotal: Record<string, number> = {};

  for (const p of pagos) {
    const estado = facturaPorOrden.get(p.orden_id);
    const destino =
      estado === "anulada" || anuladasPorSolicitud.has(p.orden_id) ? "anulado" : estado === "emitida" ? "facturado" : "noFacturado";
    const b = bloques[destino];
    const monto = Number(p.monto);
    b.total += monto;
    b.porFormaPago[p.forma_pago] = (b.porFormaPago[p.forma_pago] ?? 0) + monto;
    ordenes[destino].add(p.orden_id);
    totalPagos += monto;
    porFormaTotal[p.forma_pago] = (porFormaTotal[p.forma_pago] ?? 0) + monto;
  }

  for (const k of ["facturado", "noFacturado", "anulado"] as const) {
    bloques[k].cantidad = ordenes[k].size;
    bloques[k].total = centavos(bloques[k].total);
    for (const f of Object.keys(bloques[k].porFormaPago)) bloques[k].porFormaPago[f] = centavos(bloques[k].porFormaPago[f]);
  }

  const suma = centavos(bloques.facturado.total + bloques.noFacturado.total + bloques.anulado.total);
  // Cada método de pago también tiene que cuadrar: lo de los tres bloques suma lo cobrado con ese método
  const metodosCuadran = Object.entries(porFormaTotal).every(
    ([forma, total]) =>
      centavos(
        (bloques.facturado.porFormaPago[forma] ?? 0) + (bloques.noFacturado.porFormaPago[forma] ?? 0) + (bloques.anulado.porFormaPago[forma] ?? 0)
      ) === centavos(total)
  );
  return { ...bloques, cuadra: suma === centavos(totalPagos) && metodosCuadran };
}
