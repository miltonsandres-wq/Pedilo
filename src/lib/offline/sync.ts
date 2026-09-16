import { createClient } from "@/lib/supabase/client";
import type { EstadoMesa, EstadoOrden } from "@/lib/types/helpers";
import { db } from "./db";
import { flushOutbox } from "./outbox";

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
export async function iniciarSync(sucursalId: string, tenantId: string) {
  if (iniciado) return () => {};
  iniciado = true;

  const supabase = createClient();

  await pullInicial(sucursalId, tenantId);
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
    .subscribe();

  const onOnline = () => void flushOutbox();
  window.addEventListener("online", onOnline);
  const intervalo = window.setInterval(() => void flushOutbox(), 15_000);

  return () => {
    iniciado = false;
    supabase.removeChannel(canal);
    window.removeEventListener("online", onOnline);
    window.clearInterval(intervalo);
  };
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
      }));
    await db.productos.bulkPut(productos);
  }

  if (ordenes) {
    await db.ordenes.bulkPut(
      ordenes.map((o) => ({ ...o, estado: o.estado as EstadoOrden, total: Number(o.total) }))
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

async function aplicarCambioRemoto(
  tabla: "mesas" | "ordenes" | "orden_items" | "pagos",
  payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }
) {
  const tabla_ = db[tabla];
  if (payload.eventType === "DELETE") {
    const id = (payload.old as { id: string }).id;
    if (id) await tabla_.delete(id);
    return;
  }
  await tabla_.put(payload.new as never);
}
