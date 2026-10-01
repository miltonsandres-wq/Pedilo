import { createClient } from "@/lib/supabase/client";
import type { EstadoMesa, EstadoOrden } from "@/lib/types/helpers";
import { db, CLAVE_DELIVERY_CONFIG, type OrdenLocal } from "./db";
import { flushOutbox } from "./outbox";
import { solicitarAlmacenamientoPersistente, sincronizarFiscal } from "@/lib/fiscal/sincronizacion";

let iniciado = false;

/**
 * Arranca la sincronización para una sucursal:
 *  1. Trae un snapshot inicial de mesas/productos/órdenes abiertas/items.
 *  2. Se suscribe a Supabase Realtime para reflejar cambios de otros
 *     dispositivos (otra caja, la pantalla de cocina, etc.) en la caché local.
 *  3. Vacía el outbox al reconectar y cada cierto intervalo, por si el evento
 *     'online' del navegador no dispara (pasa en algunos móviles).
 *
 * Se llama una sola vez por sesión de POS (ver ProveedorSync).
 */
export async function iniciarSync(
  sucursalId: string,
  tenantId: string,
  puedeCobrar = false,
  omitirFiscal = false
) {
  if (iniciado) return () => {};
  iniciado = true;

  const supabase = createClient();

  void solicitarAlmacenamientoPersistente();
  await pullInicial(sucursalId, tenantId);
  await refrescarFiscal(sucursalId, tenantId, puedeCobrar, omitirFiscal);
  await refrescarDelivery(sucursalId);
  await flushOutbox();

  const canal = supabase
    .channel(`sucursal:${sucursalId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "mesas", filter: `sucursal_id=eq.${sucursalId}` },
      (payload) => aplicarCambioRemoto("mesas", payload)
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "ordenes", filter: `sucursal_id=eq.${sucursalId}` },
      (payload) => aplicarCambioRemoto("ordenes", payload)
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "orden_items", filter: `sucursal_id=eq.${sucursalId}` },
      (payload) => aplicarCambioRemoto("orden_items", payload)
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "pagos", filter: `sucursal_id=eq.${sucursalId}` },
      (payload) => aplicarCambioRemoto("pagos", payload)
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "ordenes_delivery", filter: `sucursal_id=eq.${sucursalId}` },
      (payload) => aplicarCambioRemoto("ordenes_delivery", payload)
    )
    .subscribe();

  const onOnline = () => void flushOutbox();
  window.addEventListener("online", onOnline);
  const intervalo = window.setInterval(() => void flushOutbox(), 15_000);
  // Rangos CAI, config y documentos: cada 5 min (y al reconectar) para que las
  // alertas de consumo/vencimiento y el correlativo del servidor estén al día.
  const intervaloFiscal = window.setInterval(() => void refrescarFiscal(sucursalId, tenantId, puedeCobrar, omitirFiscal), 300_000);
  const onOnlineFiscal = () => void refrescarFiscal(sucursalId, tenantId, puedeCobrar, omitirFiscal);
  window.addEventListener("online", onOnlineFiscal);
  // Config, zonas, repartidores y pedidos de delivery: se vuelven a bajar cada
  // 5 min y al reconectar (Realtime cubre los cambios de los pedidos en vivo).
  const intervaloDelivery = window.setInterval(() => void refrescarDelivery(sucursalId), 300_000);
  const onOnlineDelivery = () => void refrescarDelivery(sucursalId);
  window.addEventListener("online", onOnlineDelivery);

  return () => {
    iniciado = false;
    supabase.removeChannel(canal);
    window.removeEventListener("online", onOnline);
    window.clearInterval(intervalo);
    window.clearInterval(intervaloFiscal);
    window.removeEventListener("online", onOnlineFiscal);
    window.clearInterval(intervaloDelivery);
    window.removeEventListener("online", onOnlineDelivery);
  };
}

/** Nunca debe tumbar el arranque del POS: sin red se queda con lo cacheado. */
async function refrescarFiscal(sucursalId: string, tenantId: string, puedeCobrar: boolean, omitir = false) {
  if (omitir) return;
  try {
    await sincronizarFiscal(sucursalId, tenantId, { autoVincular: puedeCobrar });
  } catch (e) {
    console.warn("No se pudo sincronizar la facturación fiscal:", e);
  }
}

/**
 * Baja lo de delivery de esta sucursal: config (pausa, tasa del envío), zonas,
 * repartidores y los pedidos activos + los de las últimas 24 h. Nunca debe
 * tumbar el POS: sin red (o sin permiso, ej. cocina) se queda con lo cacheado.
 */
export async function refrescarDelivery(sucursalId: string) {
  try {
    const supabase = createClient();
    const desde = new Date(Date.now() - 24 * 3600_000).toISOString();
    const [{ data: config }, { data: zonas }, { data: repartidores }, { data: pedidos }] = await Promise.all([
      supabase.from("delivery_config").select("*").eq("sucursal_id", sucursalId).maybeSingle(),
      supabase.from("delivery_zonas").select("*").eq("sucursal_id", sucursalId),
      supabase.from("repartidores").select("*").eq("sucursal_id", sucursalId),
      supabase
        .from("ordenes_delivery")
        .select("*")
        .eq("sucursal_id", sucursalId)
        .or(`estado_delivery.in.(recibido,aceptado,en_cocina,listo,en_camino),created_at.gte.${desde}`),
    ]);
    if (config) await db.config.put({ clave: CLAVE_DELIVERY_CONFIG, valor: config });
    if (zonas) await db.delivery_zonas.bulkPut(zonas);
    if (repartidores) await db.repartidores.bulkPut(repartidores);
    if (pedidos) {
      await db.delivery_pedidos.bulkPut(pedidos);
      // las órdenes de delivery ya terminadas no vienen en el pull de órdenes abiertas
      const ids = pedidos.map((p) => p.orden_id);
      if (ids.length) await traerOrdenes(ids);
    }
  } catch (e) {
    console.warn("No se pudo sincronizar el delivery:", e);
  }
}

/** Trae (y cachea) las órdenes e ítems de estos pedidos que aún no estén en el dispositivo. */
async function traerOrdenes(ids: string[]) {
  const supabase = createClient();
  const locales = new Set((await db.ordenes.bulkGet(ids)).filter(Boolean).map((o) => o!.id));
  const pendientes = ids.filter((id) => !locales.has(id));
  if (pendientes.length === 0) return;
  const [{ data: ordenes }, { data: items }] = await Promise.all([
    supabase.from("ordenes").select("*").in("id", pendientes),
    supabase.from("orden_items").select("*").in("orden_id", pendientes),
  ]);
  if (ordenes) {
    await db.ordenes.bulkPut(ordenes.map((o) => ({
      ...o, estado: o.estado as EstadoOrden, canal: o.canal as OrdenLocal["canal"], total: Number(o.total),
    })));
  }
  if (items) await db.orden_items.bulkPut(items);
}

async function pullInicial(sucursalId: string, tenantId: string) {
  const supabase = createClient();

  const [{ data: sucursal }, { data: mesas }, { data: prodSuc }, { data: ordenes }, { data: formasPago }] =
    await Promise.all([
      supabase.from("sucursales").select("*").eq("id", sucursalId).single(),
      supabase.from("mesas").select("*").eq("sucursal_id", sucursalId),
      supabase
        .from("producto_sucursales")
        .select("sucursal_id, productos(*)")
        .eq("sucursal_id", sucursalId),
      supabase
        .from("ordenes")
        .select("*")
        .eq("sucursal_id", sucursalId)
        .in("estado", ["abierta", "enviada"]),
      supabase
        .from("formas_pago_sucursal")
        .select("forma_pago")
        .eq("sucursal_id", sucursalId)
        .eq("activo", true),
    ]);

  if (sucursal) {
    await db.config.put({
      clave: "sucursal",
      valor: {
        id: sucursal.id,
        nombre: sucursal.nombre,
        agenteImpresionUrl: sucursal.agente_impresion_url,
      },
    });
  }
  if (formasPago) {
    await db.config.put({
      clave: "formas_pago",
      valor: formasPago.map((f) => f.forma_pago),
    });
  }

  if (mesas) {
    await db.mesas.bulkPut(mesas.map((m) => ({ ...m, estado: m.estado as EstadoMesa })));
  }

  if (prodSuc) {
    const productos = prodSuc
      .filter((r) => r.productos && r.productos.activo)
      .map((r) => ({
        id: r.productos!.id,
        sucursal_id: sucursalId,
        categoria_id: r.productos!.categoria_id,
        nombre: r.productos!.nombre,
        descripcion: r.productos!.descripcion,
        precio: Number(r.productos!.precio),
        foto_url: r.productos!.foto_url,
        disponible: r.productos!.disponible,
        tasa_isv: r.productos!.tasa_isv,
      }));
    await db.productos.bulkPut(productos);
  }

  if (ordenes) {
    await db.ordenes.bulkPut(
      ordenes.map((o) => ({
        ...o,
        estado: o.estado as EstadoOrden,
        canal: o.canal as OrdenLocal["canal"],
        total: Number(o.total),
      }))
    );
    const ids = ordenes.map((o) => o.id);
    if (ids.length > 0) {
      const { data: items } = await supabase
        .from("orden_items")
        .select("*")
        .in("orden_id", ids);
      if (items) await db.orden_items.bulkPut(items);
    }
  }

  void tenantId; // reservado por si luego se cachea catálogo a nivel tenant
}

/** Tabla de Supabase -> tabla de Dexie, y la llave primaria cuando no es "id". */
const DESTINO_REMOTO = {
  mesas: { local: "mesas", pk: "id" },
  ordenes: { local: "ordenes", pk: "id" },
  orden_items: { local: "orden_items", pk: "id" },
  pagos: { local: "pagos", pk: "id" },
  ordenes_delivery: { local: "delivery_pedidos", pk: "orden_id" },
} as const;

async function aplicarCambioRemoto(
  tabla: keyof typeof DESTINO_REMOTO,
  payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }
) {
  const { local, pk } = DESTINO_REMOTO[tabla];
  const tabla_ = db[local] as unknown as {
    put(fila: unknown): Promise<unknown>;
    delete(id: string): Promise<void>;
  };
  if (payload.eventType === "DELETE") {
    const id = payload.old[pk] as string | undefined;
    if (id) await tabla_.delete(id);
    return;
  }
  await tabla_.put(payload.new);
}
