import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { crearBaseConMigraciones, comoUsuario } from "./harness";

const T = "a0000000-0000-0000-0000-000000000001";
const S1 = "a0000000-0000-0000-0000-0000000000a1";
const S2 = "a0000000-0000-0000-0000-0000000000a2";
const ADMIN = "a0000000-0000-0000-0000-00000000ad01";
const CAJERO = "a0000000-0000-0000-0000-00000000ca01";
const COCINA = "a0000000-0000-0000-0000-00000000c001";
const MESA = "a0000000-0000-0000-0000-0000000000b1";
const MESA2 = "a0000000-0000-0000-0000-0000000000b2";
const ORDEN = "a0000000-0000-0000-0000-0000000000c1";
const ORDEN2 = "a0000000-0000-0000-0000-0000000000c2";
const PROD = "a0000000-0000-0000-0000-0000000000d1";
const ITEM = "a0000000-0000-0000-0000-0000000000e1";

let pg: PGlite;

const comoCocina = <T,>(fn: () => Promise<T>) => comoUsuario(pg, COCINA, fn);
const comoCajero = <T,>(fn: () => Promise<T>) => comoUsuario(pg, CAJERO, fn);

beforeAll(async () => {
  pg = await crearBaseConMigraciones();
  await pg.exec(`
    insert into public.tenants (id, nombre) values ('${T}','Negocio');
    insert into public.sucursales (id, tenant_id, nombre) values ('${S1}','${T}','Centro'), ('${S2}','${T}','Norte');
    insert into auth.users (id) values ('${ADMIN}'), ('${CAJERO}'), ('${COCINA}');
    insert into public.usuarios (id, tenant_id, sucursal_id, rol, nombre) values
      ('${ADMIN}','${T}',null,'admin','Admin'),
      ('${CAJERO}','${T}','${S1}','cajero','Cajero'),
      ('${COCINA}','${T}','${S1}','cocina','Cocina');
    insert into public.mesas (id, tenant_id, sucursal_id, nombre) values ('${MESA}','${T}','${S1}','Mesa 1'), ('${MESA2}','${T}','${S2}','Mesa N');
    insert into public.productos (id, tenant_id, nombre, precio) values ('${PROD}','${T}','Tacos',50);
    insert into public.ordenes (id, tenant_id, sucursal_id, mesa_id, estado) values
      ('${ORDEN}','${T}','${S1}','${MESA}','enviada'), ('${ORDEN2}','${T}','${S2}','${MESA2}','enviada');
    insert into public.orden_items (id, orden_id, producto_id, nombre_producto, cantidad, precio_unitario)
      values ('${ITEM}','${ORDEN}','${PROD}','Tacos',2,50);
    insert into public.pagos (orden_id, monto, forma_pago) values ('${ORDEN}', 100, 'efectivo');
  `);
  // El pago de arriba cierra la orden por trigger: se deja como una orden en cocina, con su total
  await pg.query("update public.ordenes set estado = 'enviada', pagada_at = null, total = 100 where id = $1", [ORDEN]);
});

describe("el rol cocina existe y es de una sucursal", () => {
  it("la base acepta cocina y rechaza roles inventados", async () => {
    const id = "a0000000-0000-0000-0000-00000000c002";
    await pg.exec(`insert into auth.users (id) values ('${id}')`);
    await pg.exec(`insert into public.usuarios (id, tenant_id, sucursal_id, rol, nombre) values ('${id}','${T}','${S1}','cocina','Cocina 2')`);
    const id2 = "a0000000-0000-0000-0000-00000000c003";
    await pg.exec(`insert into auth.users (id) values ('${id2}')`);
    await expect(
      pg.exec(`insert into public.usuarios (id, tenant_id, sucursal_id, rol, nombre) values ('${id2}','${T}','${S1}','gerente','X')`)
    ).rejects.toThrow(/usuarios_rol_check|check/i);
  });

  it("cocina sin sucursal no se permite (solo el admin va sin sucursal)", async () => {
    const id = "a0000000-0000-0000-0000-00000000c004";
    await pg.exec(`insert into auth.users (id) values ('${id}')`);
    await expect(
      pg.exec(`insert into public.usuarios (id, tenant_id, sucursal_id, rol, nombre) values ('${id}','${T}',null,'cocina','Sin sucursal')`)
    ).rejects.toThrow(/usuarios_sucursal_requerida|check/i);
  });
});

describe("lo que cocina SÍ puede", () => {
  it("ve las órdenes, ítems y mesas de SU sucursal y nada de otra", async () => {
    const ordenes = await comoCocina(() => pg.query<{ id: string }>("select id from public.ordenes"));
    expect(ordenes.rows.map((r) => r.id)).toEqual([ORDEN]);
    const items = await comoCocina(() => pg.query("select 1 from public.orden_items"));
    expect(items.rows).toHaveLength(1);
    const mesas = await comoCocina(() => pg.query<{ id: string }>("select id from public.mesas"));
    expect(mesas.rows.map((r) => r.id)).toEqual([MESA]);
  });

  it("marca una orden como lista (despachar)", async () => {
    await comoCocina(() => pg.query("update public.ordenes set lista_cocina = true where id = $1", [ORDEN]));
    const r = await pg.query<{ lista_cocina: boolean }>("select lista_cocina from public.ordenes where id = $1", [ORDEN]);
    expect(r.rows[0].lista_cocina).toBe(true);
    await pg.query("update public.ordenes set lista_cocina = false where id = $1", [ORDEN]);
  });

  it("no puede marcar lista una orden de otra sucursal", async () => {
    const r = await comoCocina(() => pg.query("update public.ordenes set lista_cocina = true where id = $1", [ORDEN2]));
    expect(r.affectedRows).toBe(0);
    const v = await pg.query<{ lista_cocina: boolean }>("select lista_cocina from public.ordenes where id = $1", [ORDEN2]);
    expect(v.rows[0].lista_cocina).toBe(false);
  });
});

describe("lo que cocina NO puede", () => {
  it("cambiar nada más de una orden (estado, total, mesa…)", async () => {
    await expect(comoCocina(() => pg.query("update public.ordenes set estado = 'pagada' where id = $1", [ORDEN]))).rejects.toThrow(/COCINA_SOLO_LECTURA/);
    await expect(comoCocina(() => pg.query("update public.ordenes set total = 0 where id = $1", [ORDEN]))).rejects.toThrow(/COCINA_SOLO_LECTURA/);
    // ni siquiera mezclando lo permitido con lo no permitido
    await expect(
      comoCocina(() => pg.query("update public.ordenes set lista_cocina = true, estado = 'cancelada' where id = $1", [ORDEN]))
    ).rejects.toThrow(/COCINA_SOLO_LECTURA/);
  });

  it("crear o borrar órdenes", async () => {
    await expect(
      comoCocina(() => pg.query("insert into public.ordenes (tenant_id, sucursal_id, mesa_id) values ($1,$2,$3)", [T, S1, MESA]))
    ).rejects.toThrow(/COCINA_SOLO_LECTURA|row-level/);
    // borrar: ordenes no tiene política de borrado, así que no borra nada (0 filas o error)
    const borrado = await comoCocina(() => pg.query("delete from public.ordenes where id = $1", [ORDEN])).catch(() => null);
    expect(borrado?.affectedRows ?? 0).toBe(0);
    expect((await pg.query("select 1 from public.ordenes where id = $1", [ORDEN])).rows).toHaveLength(1);
  });

  it("tocar los ítems de una orden (agregar, cambiar, quitar)", async () => {
    await expect(
      comoCocina(() => pg.query("insert into public.orden_items (orden_id, producto_id, nombre_producto, cantidad, precio_unitario) values ($1,$2,'X',1,1)", [ORDEN, PROD]))
    ).rejects.toThrow(/COCINA_SOLO_LECTURA|row-level/);
    await expect(comoCocina(() => pg.query("update public.orden_items set cantidad = 9 where id = $1", [ITEM]))).rejects.toThrow(/COCINA_SOLO_LECTURA/);
    await expect(comoCocina(() => pg.query("delete from public.orden_items where id = $1", [ITEM]))).rejects.toThrow(/COCINA_SOLO_LECTURA/);
  });

  it("mover mesas", async () => {
    await expect(comoCocina(() => pg.query("update public.mesas set estado = 'libre' where id = $1", [MESA]))).rejects.toThrow(/COCINA_SOLO_LECTURA/);
  });

  it("ver ni registrar pagos, ni ver facturas ni rangos CAI", async () => {
    expect((await comoCocina(() => pg.query("select 1 from public.pagos"))).rows).toHaveLength(0);
    expect((await comoCocina(() => pg.query("select 1 from public.documentos_fiscales"))).rows).toHaveLength(0);
    expect((await comoCocina(() => pg.query("select 1 from public.cai_rangos"))).rows).toHaveLength(0);
    expect((await comoCocina(() => pg.query("select 1 from public.dispositivos_pos"))).rows).toHaveLength(0);
    await expect(
      comoCocina(() => pg.query("insert into public.pagos (orden_id, monto, forma_pago) values ($1, 10, 'efectivo')", [ORDEN]))
    ).rejects.toThrow(/row-level|COCINA/);
  });

  it("ver inventario ni incidentes (ya eran solo del admin)", async () => {
    expect((await comoCocina(() => pg.query("select 1 from public.inventario_items"))).rows).toHaveLength(0);
    expect((await comoCocina(() => pg.query("select 1 from public.incidentes_fiscales"))).rows).toHaveLength(0);
  });
});

describe("los demás roles siguen igual que antes", () => {
  it("el cajero ve pagos, opera la orden, los ítems y las mesas", async () => {
    expect((await comoCajero(() => pg.query("select 1 from public.pagos"))).rows.length).toBeGreaterThan(0);
    await comoCajero(() => pg.query("update public.ordenes set total = 100 where id = $1", [ORDEN]));
    await comoCajero(() => pg.query("update public.orden_items set cantidad = 3 where id = $1", [ITEM]));
    await comoCajero(() => pg.query("update public.mesas set estado = 'ocupada' where id = $1", [MESA]));
    await comoCajero(() => pg.query("insert into public.pagos (orden_id, monto, forma_pago) values ($1, 5, 'efectivo')", [ORDEN]));
  });

  it("el admin ve todo el negocio", async () => {
    const ordenes = await comoUsuario(pg, ADMIN, () => pg.query("select id from public.ordenes"));
    expect(ordenes.rows).toHaveLength(2);
    expect((await comoUsuario(pg, ADMIN, () => pg.query("select 1 from public.pagos"))).rows.length).toBeGreaterThan(0);
  });

  it("el servidor (sin usuario, p. ej. la carta QR) sigue pudiendo escribir ítems", async () => {
    await pg.query(
      "insert into public.orden_items (orden_id, producto_id, nombre_producto, cantidad, precio_unitario) values ($1,$2,'QR',1,10)",
      [ORDEN, PROD]
    );
  });
});
