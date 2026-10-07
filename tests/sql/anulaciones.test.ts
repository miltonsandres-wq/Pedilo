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
