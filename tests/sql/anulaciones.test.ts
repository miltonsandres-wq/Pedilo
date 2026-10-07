import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { crearBaseConMigraciones, comoUsuario } from "./harness";

const T_A = "aaaaaaaa-0000-0000-0000-00000000000a";
const T_B = "bbbbbbbb-0000-0000-0000-00000000000b";
const S_A = "aaaaaaaa-1111-0000-0000-00000000000a";
const S_A2 = "aaaaaaaa-1111-0000-0000-0000000000a2";
const S_B = "bbbbbbbb-1111-0000-0000-00000000000b";
const ADMIN_A = "aaaaaaaa-2222-0000-0000-00000000000a";
const CAJERO_A = "aaaaaaaa-3333-0000-0000-00000000000a";
const CAJERO_A2 = "aaaaaaaa-3333-0000-0000-0000000000a2";
const MESERO_A = "aaaaaaaa-3333-0000-0000-0000000000a3";
const ADMIN_B = "bbbbbbbb-2222-0000-0000-00000000000b";

let pg: PGlite;
let seq = 0;

const solicitud = (over: Record<string, unknown> = {}) => {
  seq++;
  return {
    tenant_id: T_A, sucursal_id: S_A, orden_id: `cccccccc-0000-0000-0000-${String(seq).padStart(12, "0")}`,
    referencia: `Orden #${seq}`, monto: 115, motivo: "Cobro duplicado", estado: "pendiente", ...over,
  };
};

async function insertar(usuario: string, s: ReturnType<typeof solicitud>, solicitadaPor = usuario) {
  return comoUsuario(pg, usuario, async () => {
    const r = await pg.query<{ id: string }>(
      `insert into public.solicitudes_anulacion (tenant_id, sucursal_id, orden_id, referencia, monto, motivo, estado, solicitada_por)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [s.tenant_id, s.sucursal_id, s.orden_id, s.referencia, s.monto, s.motivo, s.estado, solicitadaPor]
    );
    return r.rows[0].id;
  });
}

beforeAll(async () => {
  pg = await crearBaseConMigraciones();
  await pg.exec(`
    insert into public.tenants (id, nombre) values ('${T_A}','Negocio A'), ('${T_B}','Negocio B');
    insert into public.sucursales (id, tenant_id, nombre) values ('${S_A}','${T_A}','Suc A'), ('${S_A2}','${T_A}','Suc A2'), ('${S_B}','${T_B}','Suc B');
    insert into auth.users (id) values ('${ADMIN_A}'), ('${CAJERO_A}'), ('${CAJERO_A2}'), ('${MESERO_A}'), ('${ADMIN_B}');
    insert into public.usuarios (id, tenant_id, sucursal_id, rol, nombre) values
      ('${ADMIN_A}','${T_A}',null,'admin','Admin A'),
      ('${CAJERO_A}','${T_A}','${S_A}','cajero','Cajero A'),
      ('${CAJERO_A2}','${T_A}','${S_A2}','cajero','Cajero A2'),
      ('${MESERO_A}','${T_A}','${S_A}','mesero','Mesero A'),
      ('${ADMIN_B}','${T_B}',null,'admin','Admin B');
  `);
});

describe("solicitudes de anulación", () => {
  it("el cajero puede pedirla, pero solo pendiente y a su nombre", async () => {
    await expect(insertar(CAJERO_A, solicitud())).resolves.toBeTruthy();
    await expect(insertar(CAJERO_A, solicitud({ estado: "aprobada" }))).rejects.toThrow(); // no se autoaprueba
    await expect(insertar(CAJERO_A, solicitud(), ADMIN_A)).rejects.toThrow(); // no a nombre de otro
  });

  it("el cajero no puede pedirla para otra sucursal y el mesero no puede pedirla", async () => {
    await expect(insertar(CAJERO_A, solicitud({ sucursal_id: S_A2 }))).rejects.toThrow();
    await expect(insertar(MESERO_A, solicitud())).rejects.toThrow();
  });

  it("exige motivo y no deja apilar dos pendientes de la misma orden", async () => {
    await expect(insertar(CAJERO_A, solicitud({ motivo: "   " }))).rejects.toThrow();
    const s = solicitud();
    await insertar(CAJERO_A, s);
    await expect(insertar(CAJERO_A, s)).rejects.toThrow();
  });

  it("el cajero NO puede aprobarla; el admin sí, y queda quién y cuándo", async () => {
    const id = await insertar(CAJERO_A, solicitud());
    const porCajero = await comoUsuario(pg, CAJERO_A, () =>
      pg.query("update public.solicitudes_anulacion set estado='aprobada', resuelta_at=now(), resuelta_por=$2 where id=$1 returning id", [id, CAJERO_A])
    );
    expect(porCajero.rows).toHaveLength(0); // RLS: no ve esa fila para actualizar

    const porAdmin = await comoUsuario(pg, ADMIN_A, () =>
      pg.query<{ estado: string }>(
        "update public.solicitudes_anulacion set estado='aprobada', respuesta='Cobro duplicado confirmado', resuelta_at=now(), resuelta_por=$2 where id=$1 returning estado",
        [id, ADMIN_A]
      )
    );
    expect(porAdmin.rows[0].estado).toBe("aprobada");
  });

  it("rechazar exige una razón", async () => {
    const id = await insertar(CAJERO_A, solicitud());
    await expect(
      comoUsuario(pg, ADMIN_A, () =>
        pg.query("update public.solicitudes_anulacion set estado='rechazada', resuelta_at=now(), resuelta_por=$2 where id=$1", [id, ADMIN_A])
      )
    ).rejects.toThrow();
    await expect(
      comoUsuario(pg, ADMIN_A, () =>
        pg.query("update public.solicitudes_anulacion set estado='rechazada', respuesta='La venta es correcta', resuelta_at=now(), resuelta_por=$2 where id=$1", [id, ADMIN_A])
      )
    ).resolves.toBeTruthy();
  });

  it("visibilidad: el admin ve todo su negocio, el cajero solo su sucursal, otro negocio nada", async () => {
    const s2 = solicitud({ sucursal_id: S_A2 });
    await insertar(ADMIN_A, s2);
    const cuenta = (u: string) =>
      comoUsuario(pg, u, async () => (await pg.query<{ n: number }>("select count(*)::int as n from public.solicitudes_anulacion")).rows[0].n);
    const admin = await cuenta(ADMIN_A);
    const cajero1 = await cuenta(CAJERO_A);
    const cajero2 = await cuenta(CAJERO_A2);
    expect(admin).toBeGreaterThan(cajero1);
    expect(cajero2).toBe(1); // solo la de su sucursal
    expect(await cuenta(ADMIN_B)).toBe(0);
  });

  it("nadie las borra", async () => {
    const total = () => pg.query<{ n: number }>("select count(*)::int as n from public.solicitudes_anulacion").then((r) => r.rows[0].n);
    const antes = await total();
    // sin permiso (o sin política) de DELETE: falla o no borra nada
    await comoUsuario(pg, ADMIN_A, () => pg.query("delete from public.solicitudes_anulacion").catch(() => null));
    expect(await total()).toBe(antes);
  });
});

describe("canal del pedido y ticket sin factura (migración 0036)", () => {
  const MESA = "aaaaaaaa-4444-0000-0000-00000000000a";
  const orden = (canal: string | null, mesa: string | null, id: string) =>
    pg.query(
      "insert into public.ordenes (id, tenant_id, sucursal_id, mesa_id, canal) values ($1,$2,$3,$4,coalesce($5,'local'))",
      [id, T_A, S_A, mesa, canal]
    );

  beforeAll(async () => {
    await pg.exec(`insert into public.mesas (id, tenant_id, sucursal_id, nombre) values ('${MESA}','${T_A}','${S_A}','Mesa 1')`);
  });

  it("acepta los cuatro canales y los pedidos para llevar / plataforma van sin mesa", async () => {
    await orden("local", MESA, "dddddddd-0000-0000-0000-000000000001");
    await orden("para_llevar", null, "dddddddd-0000-0000-0000-000000000002");
    await orden("plataforma", null, "dddddddd-0000-0000-0000-000000000003");
    await orden("delivery_telefono", null, "dddddddd-0000-0000-0000-000000000004");
    const r = await pg.query<{ n: number }>("select count(*)::int as n from public.ordenes where id::text like 'dddddddd-%'");
    expect(r.rows[0].n).toBe(4);
  });

  it("un pedido de salón sigue necesitando mesa y un canal inventado se rechaza", async () => {
    await expect(orden("local", null, "dddddddd-0000-0000-0000-000000000005")).rejects.toThrow();
    await expect(orden("telepatia", null, "dddddddd-0000-0000-0000-000000000006")).rejects.toThrow();
  });

  it("guarda la referencia de la plataforma y la marca de ticket sin factura (apagadas por omisión)", async () => {
    await pg.query("update public.ordenes set referencia_externa='PedidosYa #8841', ticket_sin_factura=true where id='dddddddd-0000-0000-0000-000000000003'");
    const r = await pg.query<{ referencia_externa: string; ticket_sin_factura: boolean; otra: boolean }>(
      "select referencia_externa, ticket_sin_factura, (select ticket_sin_factura from public.ordenes where id='dddddddd-0000-0000-0000-000000000002') as otra from public.ordenes where id='dddddddd-0000-0000-0000-000000000003'"
    );
    expect(r.rows[0]).toMatchObject({ referencia_externa: "PedidosYa #8841", ticket_sin_factura: true, otra: false });
  });

  it("el negocio y el usuario traen el ticket sin factura desactivado por omisión", async () => {
    const t = await pg.query<{ ticket_sin_factura_activo: boolean }>("select ticket_sin_factura_activo from public.tenants where id=$1", [T_A]);
    const u = await pg.query<{ puede_ticket_sin_factura: boolean }>("select puede_ticket_sin_factura from public.usuarios where id=$1", [CAJERO_A]);
    expect(t.rows[0].ticket_sin_factura_activo).toBe(false);
    expect(u.rows[0].puede_ticket_sin_factura).toBe(false);
  });
});

describe("cierres diarios (migración 0037)", () => {
  const cierre = (usuario: string, fecha: string, sucursal = S_A, cerradoPor = usuario) =>
    comoUsuario(pg, usuario, () =>
      pg.query(
        "insert into public.cierres_diarios (tenant_id, sucursal_id, fecha, total_cobrado, total_ordenes, datos, cerrado_por) values ($1,$2,$3,100,2,'{}'::jsonb,$4) returning id",
        [T_A, sucursal, fecha, cerradoPor]
      )
    );

  it("el administrador cierra el día y queda quién lo cerró", async () => {
    const r = await cierre(ADMIN_A, "2026-10-01");
    expect(r.rows).toHaveLength(1);
  });

  it("un solo cierre por sucursal y día", async () => {
    await cierre(ADMIN_A, "2026-10-02");
    await expect(cierre(ADMIN_A, "2026-10-02")).rejects.toThrow();
    await expect(cierre(ADMIN_A, "2026-10-02", S_A2)).resolves.toBeTruthy(); // otra sucursal sí
  });

  it("el cajero NO puede cerrar el día ni ver los cierres", async () => {
    await expect(cierre(CAJERO_A, "2026-10-03")).rejects.toThrow();
    const n = await comoUsuario(pg, CAJERO_A, async () => (await pg.query<{ n: number }>("select count(*)::int as n from public.cierres_diarios")).rows[0].n);
    expect(n).toBe(0);
  });

  it("no se puede cerrar a nombre de otro", async () => {
    await expect(cierre(ADMIN_A, "2026-10-04", S_A, CAJERO_A)).rejects.toThrow();
  });

  it("otro negocio no ve los cierres y nadie los cambia ni los borra", async () => {
    const n = await comoUsuario(pg, ADMIN_B, async () => (await pg.query<{ n: number }>("select count(*)::int as n from public.cierres_diarios")).rows[0].n);
    expect(n).toBe(0);
    const antes = (await pg.query<{ n: number }>("select count(*)::int as n from public.cierres_diarios")).rows[0].n;
    await comoUsuario(pg, ADMIN_A, () => pg.query("update public.cierres_diarios set total_cobrado = 0").catch(() => null));
    await comoUsuario(pg, ADMIN_A, () => pg.query("delete from public.cierres_diarios").catch(() => null));
    const despues = await pg.query<{ n: number; total: number }>("select count(*)::int as n, coalesce(max(total_cobrado),0)::float as total from public.cierres_diarios");
    expect(despues.rows[0].n).toBe(antes);
    expect(despues.rows[0].total).toBe(100);
  });
});
