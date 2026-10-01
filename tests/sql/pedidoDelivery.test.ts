import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { crearBaseConMigraciones, comoUsuario } from "./harness";

const T = "e0000000-0000-0000-0000-000000000001";
const S1 = "e0000000-0000-0000-0000-0000000000a1";
const S2 = "e0000000-0000-0000-0000-0000000000a2";
const CAJERO = "e0000000-0000-0000-0000-00000000ca01";
const CAJERO2 = "e0000000-0000-0000-0000-00000000ca02";
const TACOS = "e0000000-0000-0000-0000-0000000000d1";
const AGOTADO = "e0000000-0000-0000-0000-0000000000d2";
const OTRA_SUC = "e0000000-0000-0000-0000-0000000000d3";
const ZONA = "e0000000-0000-0000-0000-0000000000b1";
const ZONA_INACTIVA = "e0000000-0000-0000-0000-0000000000b2";

let pg: PGlite;

const base = (over: Record<string, unknown> = {}) => ({
  nombre: "Ana López",
  telefono: "99887766",
  zona_id: ZONA,
  direccion_referencia: "Portón negro, frente a la pulpería",
  metodo_pago: "efectivo",
  paga_con: 500,
  items: [{ producto_id: TACOS, cantidad: 2 }],
  ...over,
});

const crear = async (pedido: unknown, canal = "delivery_web", sucursal = S1) =>
  (await pg.query<{ r: Record<string, unknown> }>("select public.crear_pedido_delivery($1, $2, $3::jsonb) r", [sucursal, canal, JSON.stringify(pedido)])).rows[0].r;

// Lunes 2026-06-01 12:00 en Honduras. PGlite usa now() real, así que el horario
// de la sucursal se arma "abierto las 24 h todos los días" y se cierra a propósito.
const SIEMPRE = JSON.stringify(
  Object.fromEntries(["dom", "lun", "mar", "mie", "jue", "vie", "sab"].map((d) => [d, [{ desde: "00:00", hasta: "23:59" }]]))
);

beforeAll(async () => {
  pg = await crearBaseConMigraciones();
  await pg.exec(`
    insert into public.tenants (id, nombre) values ('${T}','Negocio');
    insert into public.sucursales (id, tenant_id, nombre) values ('${S1}','${T}','Centro'), ('${S2}','${T}','Norte');
    insert into auth.users (id) values ('${CAJERO}'), ('${CAJERO2}');
    insert into public.usuarios (id, tenant_id, sucursal_id, rol, nombre) values
      ('${CAJERO}','${T}','${S1}','cajero','Cajero'), ('${CAJERO2}','${T}','${S2}','cajero','Cajero Norte');
    insert into public.productos (id, tenant_id, nombre, precio, tasa_isv) values
      ('${TACOS}','${T}','Tacos',50,'15'),
      ('${AGOTADO}','${T}','Pizza',120,'15'),
      ('${OTRA_SUC}','${T}','Solo Norte',80,'15');
    update public.productos set disponible = false where id = '${AGOTADO}';
    insert into public.producto_sucursales (producto_id, sucursal_id) values
      ('${TACOS}','${S1}'), ('${AGOTADO}','${S1}'), ('${OTRA_SUC}','${S2}');
    insert into public.delivery_config (sucursal_id, activo, horario, monto_minimo, metodos_pago)
      values ('${S1}', true, '${SIEMPRE}'::jsonb, 80, array['efectivo','transferencia']);
    insert into public.delivery_zonas (id, sucursal_id, nombre, tarifa, activa) values
      ('${ZONA}','${S1}','Col. Trejo',30,true), ('${ZONA_INACTIVA}','${S1}','Lejos',80,false);
  `);
});

describe("recalculo en el servidor", () => {
  it("ignora precios, totales y tarifas manipulados por el cliente", async () => {
    const r = await crear(base({
      total: 1, subtotal: 1, tarifa_envio: 0, envio: 0,
      items: [{ producto_id: TACOS, cantidad: 2, precio: 0.01, precio_unitario: 0.01 }],
    }));
    expect(r).toMatchObject({ subtotal: 100, envio: 30, total: 130 });
    const items = await pg.query<{ precio_unitario: number; nombre_producto: string; tasa_isv: string }>(
      "select precio_unitario, nombre_producto, tasa_isv from public.orden_items where orden_id = $1", [r.orden_id]);
    expect(items.rows).toEqual([{ precio_unitario: 50, nombre_producto: "Tacos", tasa_isv: "15" }]);
    const d = (await pg.query<{ tarifa_envio: number }>("select tarifa_envio from public.ordenes_delivery where orden_id=$1", [r.orden_id])).rows[0];
    expect(d.tarifa_envio).toBe(30);
    expect((await pg.query<{ total: number }>("select total from public.ordenes where id=$1", [r.orden_id])).rows[0].total).toBe(100);
  });

  it("devuelve número de pedido y un token de seguimiento largo", async () => {
    const r = await crear(base());
    expect(typeof r.numero).toBe("number");
    expect(String(r.tracking_token).length).toBeGreaterThanOrEqual(40);
    const s = (await pg.query<{ s: { estado: string } }>("select public.seguimiento_pedido($1) s", [r.tracking_token])).rows[0].s;
    expect(s.estado).toBe("recibido");
  });

  it("el pedido nace en estado recibido, canal delivery_web y sin usuario", async () => {
    const r = await crear(base());
    const o = (await pg.query<{ canal: string; usuario_id: string | null; estado: string }>(
      "select canal, usuario_id, estado from public.ordenes where id=$1", [r.orden_id])).rows[0];
    expect(o).toEqual({ canal: "delivery_web", usuario_id: null, estado: "abierta" });
  });
});

describe("pedido rechazado", () => {
  const cuenta = async () => (await pg.query<{ n: number }>("select count(*)::int n from public.ordenes_delivery")).rows[0].n;

  it("bajo el monto mínimo (y no deja nada a medias)", async () => {
    const antes = await cuenta();
    const ordenesAntes = (await pg.query<{ n: number }>("select count(*)::int n from public.ordenes")).rows[0].n;
    await expect(crear(base({ items: [{ producto_id: TACOS, cantidad: 1 }] }))).rejects.toThrow(/DELIVERY_MINIMO.*80\.00/);
    expect(await cuenta()).toBe(antes);
    expect((await pg.query<{ n: number }>("select count(*)::int n from public.ordenes")).rows[0].n).toBe(ordenesAntes);
  });

  it("delivery pausado", async () => {
    await pg.exec(`update public.delivery_config set pausado = true where sucursal_id='${S1}'`);
    await expect(crear(base())).rejects.toThrow(/DELIVERY_CERRADO.*pausó/);
    await pg.exec(`update public.delivery_config set pausado = false where sucursal_id='${S1}'`);
    await crear(base());
  });

  it("fuera de horario", async () => {
    await pg.exec(`update public.delivery_config set horario = '{}'::jsonb where sucursal_id='${S1}'`);
    await expect(crear(base())).rejects.toThrow(/DELIVERY_CERRADO.*horario/);
    await pg.exec(`update public.delivery_config set horario = '${SIEMPRE}'::jsonb where sucursal_id='${S1}'`);
  });

  it("delivery desactivado o sin configurar", async () => {
    await expect(crear(base(), "delivery_web", S2)).rejects.toThrow(/DELIVERY_CERRADO/);
  });

  it("producto agotado, de otra sucursal, inexistente o cantidad absurda", async () => {
    await expect(crear(base({ items: [{ producto_id: AGOTADO, cantidad: 1 }] }))).rejects.toThrow(/DELIVERY_PRODUCTO/);
    await expect(crear(base({ items: [{ producto_id: OTRA_SUC, cantidad: 3 }] }))).rejects.toThrow(/DELIVERY_PRODUCTO/);
    await expect(crear(base({ items: [{ producto_id: "e0000000-0000-0000-0000-0000000000ff", cantidad: 3 }] }))).rejects.toThrow(/DELIVERY_PRODUCTO/);
    await expect(crear(base({ items: [{ producto_id: TACOS, cantidad: 0 }] }))).rejects.toThrow(/DELIVERY_ITEMS/);
    await expect(crear(base({ items: [{ producto_id: TACOS, cantidad: -3 }] }))).rejects.toThrow(/DELIVERY_ITEMS/);
    await expect(crear(base({ items: [{ producto_id: TACOS, cantidad: 9999 }] }))).rejects.toThrow(/DELIVERY_ITEMS/);
    await expect(crear(base({ items: [] }))).rejects.toThrow(/DELIVERY_ITEMS/);
  });

  it("zona inactiva/inexistente y método de pago no habilitado", async () => {
    await expect(crear(base({ zona_id: ZONA_INACTIVA }))).rejects.toThrow(/DELIVERY_ZONA/);
    await expect(crear(base({ zona_id: null }))).rejects.toThrow(/DELIVERY_ZONA/);
    await expect(crear(base({ metodo_pago: "tarjeta_contra_entrega" }))).rejects.toThrow(/DELIVERY_PAGO/);
  });

  it("datos del cliente: teléfono, referencia, RTN y 'paga con'", async () => {
    await expect(crear(base({ telefono: "1234" }))).rejects.toThrow(/DELIVERY_DATOS.*8 dígitos/);
    await expect(crear(base({ direccion_referencia: " " }))).rejects.toThrow(/DELIVERY_DATOS.*referencia/);
    await expect(crear(base({ nombre: "" }))).rejects.toThrow(/DELIVERY_DATOS/);
    await expect(crear(base({ tipo_factura: "con_rtn", factura_rtn: "123", factura_nombre: "X" }))).rejects.toThrow(/DELIVERY_DATOS.*RTN/);
    await expect(crear(base({ paga_con: 50 }))).rejects.toThrow(/DELIVERY_PAGA_CON/);
    const ok = await crear(base({ tipo_factura: "con_rtn", factura_rtn: "08011999123456", factura_nombre: "Empresa SA" }));
    const d = (await pg.query<{ factura_rtn: string; tipo_factura: string }>(
      "select factura_rtn, tipo_factura from public.ordenes_delivery where orden_id=$1", [ok.orden_id])).rows[0];
    expect(d).toEqual({ factura_rtn: "08011999123456", tipo_factura: "con_rtn" });
  });
});

describe("pedido por teléfono (personal del POS)", () => {
  const comoCajero = <X,>(id: string, fn: () => Promise<X>) => comoUsuario(pg, id, fn);

  it("el cajero de la sucursal lo registra aunque el delivery web esté pausado", async () => {
    await pg.exec(`update public.delivery_config set pausado = true where sucursal_id='${S1}'`);
    const r = await comoCajero(CAJERO, () => crear(base({ paga_con: null }), "delivery_telefono"));
    await pg.exec(`update public.delivery_config set pausado = false where sucursal_id='${S1}'`);
    const o = (await pg.query<{ canal: string; usuario_id: string }>("select canal, usuario_id from public.ordenes where id=$1", [r.orden_id])).rows[0];
    expect(o).toEqual({ canal: "delivery_telefono", usuario_id: CAJERO });
  });

  it("de todos modos recalcula precios y respeta el mínimo", async () => {
    await expect(comoCajero(CAJERO, () => crear(base({ items: [{ producto_id: TACOS, cantidad: 1 }] }), "delivery_telefono")))
      .rejects.toThrow(/DELIVERY_MINIMO/);
  });

  it("personal de otra sucursal no puede", async () => {
    await expect(comoCajero(CAJERO2, () => crear(base(), "delivery_telefono"))).rejects.toThrow(/DELIVERY_SIN_PERMISO/);
  });

  it("canal inválido", async () => {
    await expect(crear(base(), "local")).rejects.toThrow(/DELIVERY_CANAL/);
  });
});
