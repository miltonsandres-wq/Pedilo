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
}: {
  sucursalId: string;
  tenantId: string;
}) {
  useEffect(() => {
    let limpiar: (() => void) | undefined;
    iniciarSync(sucursalId, tenantId).then((fn) => {
      limpiar = fn;
    });
    return () => limpiar?.();
  }, [sucursalId, tenantId]);

  return null;
}
