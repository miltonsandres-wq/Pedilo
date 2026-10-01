import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { crearBaseConMigraciones } from "../sql/harness";
import { procesarPedidoPublico, mensajeDeError, LIMITES, type ClienteAdminMinimo, type PedidoPublico } from "@/lib/delivery/crearPedidoPublico";
import { validarCheckout, normalizarTelefonoHN, esTelefonoHN, calcularCambio, type DatosCheckout } from "@/lib/delivery/validaciones";

const T = "f0000000-0000-0000-0000-000000000001";
const S = "f0000000-0000-0000-0000-0000000000a1";
const TACOS = "f0000000-0000-0000-0000-0000000000d1";
const ZONA = "f0000000-0000-0000-0000-0000000000b1";

let pg: PGlite;

/** Doble del cliente admin: corre las RPC y consultas contra el Postgres real (sin RLS, como la service role). */
function adminFalso(): ClienteAdminMinimo {
  return {
    rpc: async (fn, args) => {
      const nombres = Object.keys(args);
      const sql = `select public.${fn}(${nombres.map((n, i) => `${n} => $${i + 1}${typeof args[n] === "object" && args[n] !== null ? "::jsonb" : ""}`).join(", ")}) as r`;
      try {
        const r = await pg.query<{ r: unknown }>(sql, nombres.map((n) => (typeof args[n] === "object" && args[n] !== null ? JSON.stringify(args[n]) : args[n])));
        return { data: r.rows[0].r, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    },
    from: (tabla) => ({
      select: () => ({
        eq: (col, val) => ({
          maybeSingle: async () => {
            const r = await pg.query(`select * from public.${tabla} where ${col} = $1`, [val]);
            return { data: r.rows[0] ?? null, error: null };
          },
        }),
      }),
    }),
  };
}

const pedido = (over: Partial<PedidoPublico> = {}): PedidoPublico => ({
  nombre: "Ana",
  telefono: "9988-7766",
  zonaId: ZONA,
  direccionReferencia: "Portón negro, frente a la pulpería",
  metodoPago: "efectivo",
  pagaCon: 500,
  items: [{ productoId: TACOS, cantidad: 2 }],
  ...over,
});

beforeAll(async () => {
  pg = await crearBaseConMigraciones();
  const todos = JSON.stringify(Object.fromEntries(["dom", "lun", "mar", "mie", "jue", "vie", "sab"].map((d) => [d, [{ desde: "00:00", hasta: "23:59" }]])));
  await pg.exec(`
    insert into public.tenants (id, nombre) values ('${T}','Negocio');
    insert into public.sucursales (id, tenant_id, nombre) values ('${S}','${T}','Centro');
    insert into public.productos (id, tenant_id, nombre, precio) values ('${TACOS}','${T}','Tacos',50);
    insert into public.producto_sucursales (producto_id, sucursal_id) values ('${TACOS}','${S}');
    insert into public.delivery_config (sucursal_id, activo, horario, slug, monto_minimo) values ('${S}', true, '${todos}'::jsonb, 'fondita', 80);
    insert into public.delivery_zonas (id, sucursal_id, nombre, tarifa) values ('${ZONA}','${S}','Col. Trejo',30);
  `);
});

describe("procesarPedidoPublico", () => {
  it("crea el pedido por slug con total recalculado y token", async () => {
    const r = await procesarPedidoPublico(adminFalso(), "fondita", "10.0.0.1", pedido());
    expect(r).toMatchObject({ ok: true, subtotal: 100, envio: 30, total: 130 });
    if (r.ok) expect(r.trackingToken.length).toBeGreaterThan(40);
  });

  it("normaliza el teléfono (9988-7766 → 99887766)", async () => {
    await procesarPedidoPublico(adminFalso(), "fondita", "10.0.0.2", pedido({ telefono: "+504 9988-7766" }));
    const t = (await pg.query<{ t: string }>("select cliente_telefono t from public.ordenes_delivery order by created_at desc limit 1")).rows[0].t;
    expect(t).toBe("99887766");
  });

  it("honeypot lleno: se rechaza sin crear nada", async () => {
    const antes = (await pg.query<{ n: number }>("select count(*)::int n from public.ordenes")).rows[0].n;
    const r = await procesarPedidoPublico(adminFalso(), "fondita", "10.0.0.3", pedido({ sitioWeb: "http://spam" }));
    expect(r.ok).toBe(false);
    expect((await pg.query<{ n: number }>("select count(*)::int n from public.ordenes")).rows[0].n).toBe(antes);
  });

  it("rate limit por teléfono", async () => {
    const res: boolean[] = [];
    for (let i = 0; i < LIMITES.porTelefono.max + 2; i++) {
      res.push((await procesarPedidoPublico(adminFalso(), "fondita", `10.1.0.${i}`, pedido({ telefono: "98765432" }))).ok);
    }
    expect(res.filter(Boolean).length).toBe(LIMITES.porTelefono.max);
    const ultimo = await procesarPedidoPublico(adminFalso(), "fondita", "10.1.9.9", pedido({ telefono: "98765432" }));
    expect(ultimo).toMatchObject({ ok: false, error: expect.stringMatching(/varios pedidos/) });
  });

  it("rate limit por IP", async () => {
    let ultimo;
    for (let i = 0; i < LIMITES.porIp.max + 1; i++) {
      ultimo = await procesarPedidoPublico(adminFalso(), "fondita", "10.9.9.9", pedido({ telefono: `9000${String(1000 + i)}` }));
    }
    expect(ultimo).toMatchObject({ ok: false, error: expect.stringMatching(/demasiados intentos/) });
  });

  it("slug inexistente", async () => {
    expect(await procesarPedidoPublico(adminFalso(), "no-existe", "10.0.0.7", pedido())).toMatchObject({ ok: false, error: "Este restaurante no existe." });
  });

  it("errores del servidor llegan en español y sin detalles internos", async () => {
    const r = await procesarPedidoPublico(adminFalso(), "fondita", "10.0.0.8", pedido({ items: [{ productoId: TACOS, cantidad: 1 }] }));
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/mínimo de pedido es L 80\.00/) });
    expect(mensajeDeError('insert or update on table "x" violates foreign key')).toBe("No pudimos registrar tu pedido. Intenta de nuevo en un momento.");
  });

  it("un precio manipulado en el cuerpo no cambia el total", async () => {
    const manipulado = pedido({ telefono: "91112222", items: [{ productoId: TACOS, cantidad: 2, precio: 1, total: 1 } as never] });
    expect(await procesarPedidoPublico(adminFalso(), "fondita", "10.0.0.9", manipulado)).toMatchObject({ ok: true, total: 130 });
  });
});

describe("validaciones del checkout", () => {
  const datos = (o: Partial<DatosCheckout> = {}): DatosCheckout => ({
    nombre: "Ana", telefono: "99887766", zonaId: "z", direccionReferencia: "Casa azul junto al parque",
    metodoPago: "efectivo", pagaCon: "", conRtn: false, facturaNombre: "", facturaRtn: "", ...o,
  });

  it("teléfono hondureño de 8 dígitos (acepta +504 y guiones)", () => {
    expect(normalizarTelefonoHN("+504 9988-7766")).toBe("99887766");
    expect(esTelefonoHN("9988-7766")).toBe(true);
    expect(esTelefonoHN("1234567")).toBe(false);
    expect(esTelefonoHN("19887766")).toBe(false); // los celulares/fijos hondureños empiezan con 2, 3, 8 o 9
  });

  it("formulario válido no tiene errores", () => {
    expect(validarCheckout(datos(), 130, ["efectivo"])).toEqual({});
  });

  it("referencia obligatoria, zona, método, 'paga con' insuficiente y RTN de 14 dígitos", () => {
    const e = validarCheckout(datos({ direccionReferencia: "", zonaId: "", metodoPago: "", conRtn: true, facturaRtn: "12" }), 130, ["efectivo"]);
    expect(Object.keys(e).sort()).toEqual(["direccionReferencia", "facturaNombre", "facturaRtn", "metodoPago", "zonaId"]);
    expect(validarCheckout(datos({ pagaCon: "100" }), 130, ["efectivo"]).pagaCon).toMatch(/no alcanza/);
    expect(validarCheckout(datos({ metodoPago: "transferencia" }), 130, ["efectivo"]).metodoPago).toBeTruthy();
  });

  it("cambio a llevar", () => {
    expect(calcularCambio(130, 500)).toBe(370);
    expect(calcularCambio(130, null)).toBe(0);
    expect(calcularCambio(130, 100)).toBe(0);
  });
});
