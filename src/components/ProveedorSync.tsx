"use client";

import { useEffect } from "react";
import { iniciarSync } from "@/lib/offline/sync";

/**
 * Arranca la sincronización offline (pull inicial + realtime + outbox) en
 * cuanto el POS carga en el navegador. Vive en el layout del POS para que
 * todas sus páginas (mapa de mesas, detalle de orden) compartan la misma
 * caché de Dexie ya poblada.
 */
export function ProveedorSync({
  sucursalId,
  tenantId,
  puedeCobrar = false,
  omitirFiscal = false,
}: {
  sucursalId: string;
  tenantId: string;
  /** Solo el cajero cobra: es quien vincula solo la caja de la sucursal. */
  puedeCobrar?: boolean;
  /** Cocina no factura ni ve dinero: no se baja nada fiscal. */
  omitirFiscal?: boolean;
}) {
  useEffect(() => {
    let limpiar: (() => void) | undefined;
    iniciarSync(sucursalId, tenantId, puedeCobrar, omitirFiscal).then((fn) => {
      limpiar = fn;
    });
    return () => limpiar?.();
  }, [sucursalId, tenantId, puedeCobrar, omitirFiscal]);

  return null;
}
