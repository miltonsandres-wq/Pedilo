import type { ApiRepartidor } from "./api";
import type { AccionRep, BaseRepartidor, EventoRastro, PedidoRep, PuntoRastroRep, TipoAccionRep } from "./db";

/**
 * Sincronización offline de la PWA del repartidor. Funciona con señal
 * intermitente: cada cambio de estado se aplica en la base local al instante
 * y se encola; `sincronizar()` lo sube en orden cuando hay conexión.
 *
 * Reglas:
 *  - FIFO: un fallo transitorio (sin señal) frena la cola y se reintenta;
 *  - un rechazo DEFINITIVO del servidor (transición inválida, pedido que ya no
 *    es suyo, cancelado mientras estaba sin señal…) NO se reintenta para
 *    siempre: se descarta la acción, se refresca desde el servidor y, si el
 *    resultado no coincide con lo que el repartidor hizo, se le avisa.
 *  - la hora que se sube es la de CUANDO ocurrió, no la de cuando hubo señal.
 */

const ESTADO_DESTINO: Record<TipoAccionRep, (p: PedidoRep) => boolean> = {
  salir: (p) => p.estado_delivery === "en_camino" || p.estado_delivery === "entregado",
  llegar: (p) => p.llegado_at != null || p.estado_delivery === "entregado",
  entregar: (p) => p.estado_delivery === "entregado",
};

const MENSAJE_CONFLICTO: Record<TipoAccionRep, string> = {
  salir: "No se pudo registrar tu salida: el restaurante cambió el pedido. Revisa su estado.",
  llegar: "No se pudo registrar tu llegada.",
  entregar: "No se pudo registrar la entrega: el restaurante cambió el pedido. Avísale al cajero.",
};

/**
 * Aplica la acción en la base local (optimista) y la encola. Devuelve false si
 * no corresponde (ej. "Salí" en un pedido que no está listo).
 */
export async function registrarAccion(
  base: BaseRepartidor,
  orden_id: string,
  tipo: TipoAccionRep,
  datos: AccionRep["datos"] = {},
  ahora: Date = new Date()
): Promise<boolean> {
  const pedido = await base.pedidos.get(orden_id);
  if (!pedido) return false;
  const ts = ahora.toISOString();

  if (tipo === "salir") {
    if (pedido.estado_delivery !== "listo") return false;
    await base.pedidos.update(orden_id, { estado_delivery: "en_camino", en_camino_at: ts, conflicto: null });
  } else if (tipo === "llegar") {
    if (pedido.estado_delivery !== "en_camino" || pedido.llegado_at) return false;
    await base.pedidos.update(orden_id, { llegado_at: ts, llegada_automatica: !!datos.automatica });
  } else {
    if (pedido.estado_delivery !== "en_camino") return false;
    await base.pedidos.update(orden_id, {
      estado_delivery: "entregado",
      entregado_at: ts,
      llegado_at: pedido.llegado_at ?? ts,
      monto_cobrado: datos.monto ?? pedido.total,
      entrega_lat: datos.lat ?? null,
      entrega_lng: datos.lng ?? null,
    });
  }

  await base.acciones.add({ id: crypto.randomUUID(), orden_id, tipo, ts, datos, intentos: 0, ultimo_error: null });
  return true;
}

/** Guarda un punto del rastro (evento o muestra) para subirlo cuando haya señal. */
export async function guardarPuntoRastro(
  base: BaseRepartidor,
  punto: Omit<PuntoRastroRep, "id" | "registrado_at"> & { registrado_at?: string; evento: EventoRastro }
) {
  await base.rastro.add({ id: crypto.randomUUID(), registrado_at: new Date().toISOString(), ...punto });
}

export interface ResultadoSync {
  subidas: number;
  pendientes: number;
  sinSenal: boolean;
}

/** Sube las acciones en orden. Se detiene en el primer fallo transitorio. */
export async function vaciarAcciones(base: BaseRepartidor, api: ApiRepartidor): Promise<{ sinSenal: boolean; subidas: number; rechazadas: AccionRep[] }> {
  const rechazadas: AccionRep[] = [];
  let subidas = 0;
  for (const accion of await base.acciones.orderBy("ts").toArray()) {
    const r = await api.enviarAccion(accion);
    if (r.ok) {
      await base.acciones.delete(accion.id);
      subidas += 1;
    } else if (r.permanente) {
      await base.acciones.delete(accion.id);
      rechazadas.push({ ...accion, ultimo_error: r.error });
    } else {
      await base.acciones.update(accion.id, { intentos: accion.intentos + 1, ultimo_error: r.error });
      return { sinSenal: true, subidas, rechazadas };
    }
  }
  return { sinSenal: false, subidas, rechazadas };
}

/**
 * Trae los pedidos asignados y los mezcla con lo local. Un pedido con acciones
 * todavía sin subir conserva lo que el repartidor hizo (el servidor aún no lo sabe).
 */
export async function refrescarPedidos(base: BaseRepartidor, api: ApiRepartidor): Promise<boolean> {
  const r = await api.traerPedidos();
  if (!r.ok) return false;

  const conPendientes = new Set((await base.acciones.toArray()).map((a) => a.orden_id));
  const locales = new Map((await base.pedidos.toArray()).map((p) => [p.orden_id, p]));
  const vigentes = new Set(r.pedidos.map((p) => p.orden_id));

  for (const p of r.pedidos) {
    const local = locales.get(p.orden_id);
    if (conPendientes.has(p.orden_id) && local) {
      // lo estático puede cambiar (ítems, dirección); el estado local manda hasta subirlo
      await base.pedidos.put({
        ...p,
        estado_delivery: local.estado_delivery,
        en_camino_at: local.en_camino_at ?? p.en_camino_at,
        llegado_at: local.llegado_at ?? p.llegado_at,
        llegada_automatica: local.llegada_automatica,
        entregado_at: local.entregado_at ?? p.entregado_at,
        monto_cobrado: local.monto_cobrado ?? p.monto_cobrado,
        entrega_lat: local.entrega_lat ?? p.entrega_lat,
        entrega_lng: local.entrega_lng ?? p.entrega_lng,
        conflicto: local.conflicto,
      });
    } else {
      await base.pedidos.put({ ...p, conflicto: local?.conflicto ?? null });
    }
  }
  // Lo que dejó de ser suyo (reasignado, liquidado, cancelado) sale, salvo que tenga acciones por subir
  for (const [id] of locales) {
    if (!vigentes.has(id) && !conPendientes.has(id)) await base.pedidos.delete(id);
  }
  return true;
}

/** Sube el rastro acumulado de a lotes. Un rechazo definitivo descarta el lote. */
export async function subirRastroPendiente(base: BaseRepartidor, api: ApiRepartidor, lote = 50): Promise<boolean> {
  for (;;) {
    const puntos = await base.rastro.orderBy("registrado_at").limit(lote).toArray();
    if (puntos.length === 0) return true;
    const r = await api.subirRastro(puntos);
    if (!r.ok && !r.permanente) return false;
    await base.rastro.bulkDelete(puntos.map((p) => p.id));
  }
}

/** Ciclo completo: acciones → pedidos → rastro. Seguro llamarlo cada pocos segundos y al volver la señal. */
export async function sincronizar(base: BaseRepartidor, api: ApiRepartidor): Promise<ResultadoSync> {
  const { sinSenal, subidas, rechazadas } = await vaciarAcciones(base, api);
  const traidos = await refrescarPedidos(base, api);

  // Si el servidor no aceptó algo, se avisa solo cuando el estado real no coincide con lo que se hizo
  for (const a of rechazadas) {
    const p = await base.pedidos.get(a.orden_id);
    if (p && !ESTADO_DESTINO[a.tipo](p)) await base.pedidos.update(a.orden_id, { conflicto: MENSAJE_CONFLICTO[a.tipo] });
  }

  // El rastro va DESPUÉS de las acciones: el servidor solo acepta puntos con el pedido en camino
  if (!sinSenal && traidos) await subirRastroPendiente(base, api);

  return { subidas, pendientes: await base.acciones.count(), sinSenal: sinSenal || !traidos };
}
