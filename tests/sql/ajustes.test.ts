import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { crearBaseConMigraciones } from "./harness";

let pg: PGlite;

beforeAll(async () => {
  pg = await crearBaseConMigraciones();
});

describe("ajustes de onboarding (migración 0020)", () => {
  it("cada sucursal nueva recibe sola su caja de cobro: 000 la primera del negocio, 001 la segunda", async () => {
    const T = "cccccccc-0000-0000-0000-00000000000c";
    await pg.exec(`insert into public.tenants (id, nombre) values ('${T}','Negocio C')`);
    await pg.exec(`insert into public.sucursales (id, tenant_id, nombre) values ('cccccccc-1111-0000-0000-000000000001','${T}','Centro')`);
    await pg.exec(`insert into public.sucursales (id, tenant_id, nombre) values ('cccccccc-1111-0000-0000-000000000002','${T}','Norte')`);
    const r = await pg.query<{ nombre: string; establecimiento: string; punto_emision: string; sucursal_id: string }>(
      "select nombre, establecimiento, punto_emision, sucursal_id from public.dispositivos_pos where tenant_id=$1 order by establecimiento",
      [T]
    );
    expect(r.rows).toEqual([
      { nombre: "Caja principal", establecimiento: "000", punto_emision: "001", sucursal_id: "cccccccc-1111-0000-0000-000000000001" },
      { nombre: "Caja principal", establecimiento: "001", punto_emision: "001", sucursal_id: "cccccccc-1111-0000-0000-000000000002" },
    ]);
  });

  it("varias sucursales insertadas de una vez también reciben números distintos", async () => {
    const T = "dddddddd-0000-0000-0000-00000000000d";
    await pg.exec(`insert into public.tenants (id, nombre) values ('${T}','Negocio D')`);
    await pg.exec(`insert into public.sucursales (tenant_id, nombre) values ('${T}','A'), ('${T}','B'), ('${T}','C')`);
    const r = await pg.query<{ est: string }>(
      "select establecimiento as est from public.dispositivos_pos where tenant_id=$1 order by establecimiento",
      [T]
    );
    expect(r.rows.map((x) => x.est)).toEqual(["000", "001", "002"]);
  });

  it("cada negocio numera sus cajas por su cuenta", async () => {
    const T = "ffffffff-0000-0000-0000-00000000000f";
    await pg.exec(`insert into public.tenants (id, nombre) values ('${T}','Negocio F')`);
    await pg.exec(`insert into public.sucursales (tenant_id, nombre) values ('${T}','Unica')`);
    const r = await pg.query<{ est: string }>(
      "select establecimiento as est from public.dispositivos_pos where tenant_id=$1",
      [T]
    );
    expect(r.rows).toEqual([{ est: "000" }]);
  });

  it("un negocio nuevo nace sin configuración inicial ni tutorial, y existe la columna de la contraseña cifrada", async () => {
    const T = "eeeeeeee-0000-0000-0000-00000000000e";
    await pg.exec(`insert into public.tenants (id, nombre) values ('${T}','Negocio E')`);
    const r = await pg.query<{ cfg: string | null; tut: string | null }>(
      "select configuracion_inicial_at as cfg, tutorial_completado_at as tut from public.tenants where id=$1",
      [T]
    );
    expect(r.rows[0]).toEqual({ cfg: null, tut: null });
    await pg.exec("select clave_cifrada from public.usuarios limit 1");
  });
});
