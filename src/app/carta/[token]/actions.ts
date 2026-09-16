"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export interface ItemCarrito {
  productoId: string;
  cantidad: number;
  nota?: string;
}

export interface ResultadoPedido {
  ok: boolean;
  error?: string;
}

/**
 * El cliente manda su pedido desde /carta/[token] (sin sesión). Se valida
 * todo del lado del servidor con el cliente admin (service role):
 *  - el token debe corresponder a una mesa activa,
 *  - cada producto debe existir, estar disponible y ofrecerse en esa
 *    sucursal (nunca se confía en nombre/precio que mande el navegador),
 *  - el pedido cae en la orden abierta de la mesa (o abre una si no había).
 * Los ítems quedan marcados `origen_cliente = true` para que el mesero los
 * distinga en su pantalla; el resto del flujo (enviar a cocina, cobrar) es
 * el mismo de siempre.
 */
export async function enviarPedidoCliente(
  token: string,
  items: ItemCarrito[]
): Promise<ResultadoPedido> {
  if (items.length === 0) return { ok: false, error: "El carrito está vacío." };

  const admin = createAdminClient();

  const { data: mesa } = await admin
    .from("mesas")
    .select("id, sucursal_id, tenant_id, estado, activa")
    .eq("qr_token", token)
    .eq("activa", true)
    .maybeSingle();

  if (!mesa) return { ok: false, error: "Esta mesa ya no está disponible." };

  const productoIds = items.map((i) => i.productoId);
  const { data: disponibles } = await admin
    .from("producto_sucursales")
    .select("productos(id, nombre, precio, disponible, activo)")
    .eq("sucursal_id", mesa.sucursal_id)
    .in("producto_id", productoIds);

  const productosPorId = new Map(
    (disponibles ?? [])
      .map((r) => r.productos)
      .filter((p): p is NonNullable<typeof p> => !!p && p.activo && p.disponible)
      .map((p) => [p.id, p])
  );

  const itemsValidos = items.filter((i) => productosPorId.has(i.productoId) && i.cantidad > 0);
  if (itemsValidos.length === 0) {
    return { ok: false, error: "Esos platillos ya no están disponibles." };
  }

  let { data: orden } = await admin
    .from("ordenes")
    .select("id")
    .eq("mesa_id", mesa.id)
    .in("estado", ["abierta", "enviada"])
    .maybeSingle();

  if (!orden) {
    const { data: nuevaOrden, error: errOrden } = await admin
      .from("ordenes")
      .insert({
        tenant_id: mesa.tenant_id,
        sucursal_id: mesa.sucursal_id,
        mesa_id: mesa.id,
        usuario_id: null, // nadie del staff la abrió; la abrió el cliente desde el QR
        estado: "abierta",
      })
      .select("id")
      .single();
    if (errOrden || !nuevaOrden) return { ok: false, error: "No se pudo abrir la orden." };
    orden = nuevaOrden;

    if (mesa.estado === "libre") {
      await admin.from("mesas").update({ estado: "ocupada" }).eq("id", mesa.id);
    }
  }

  const filas = itemsValidos.map((i) => {
    const producto = productosPorId.get(i.productoId)!;
    return {
      orden_id: orden!.id,
      tenant_id: mesa.tenant_id,
      sucursal_id: mesa.sucursal_id,
      producto_id: producto.id,
      nombre_producto: producto.nombre,
      cantidad: i.cantidad,
      precio_unitario: producto.precio,
      nota: i.nota ?? null,
      origen_cliente: true,
    };
  });

  const { error: errItems } = await admin.from("orden_items").insert(filas);
  if (errItems) return { ok: false, error: "No se pudo enviar el pedido." };

  return { ok: true };
}
