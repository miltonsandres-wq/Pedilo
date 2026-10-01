import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { crearBaseConMigraciones, comoUsuario, comoRepartidor } from "./harness";

const T = "d0000000-0000-0000-0000-000000000001";
const T2 = "d0000000-0000-0000-0000-000000000002";
const S1 = "d0000000-0000-0000-0000-0000000000a1";
const S2 = "d0000000-0000-0000-0000-0000000000a2"; // del otro negocio
const ADMIN = "d0000000-0000-0000-0000-00000000ad01";
const ADMIN2 = "d0000000-0000-0000-0000-00000000ad02";
const CAJERO = "d0000000-0000-0000-0000-00000000ca01";
const COCINA = "d0000000-0000-0000-0000-00000000c001";
const R1 = "d0000000-0000-0000-0000-0000000000f1";
const R2 = "d0000000-0000-0000-0000-0000000000f2";
const PROD = "d0000000-0000-0000-0000-0000000000d1";
const ZONA = "d0000000-0000-0000-0000-0000000000b1";
const O1 = "d0000000-0000-0000-0000-0000000000c1";
const O2 = "d0000000-0000-0000-0000-0000000000c2";

let pg: PGlite;
const comoCajero = <X,>(fn: () => Promise<X>) => comoUsuario(pg, CAJERO, fn);
const comoAdmin2 = <X,>(fn: () => Promise<X>) => comoUsuario(pg, ADMIN2, fn);
const comoCocina = <X,>(fn: () => Promise<X>) => comoUsuario(pg, COCINA, fn);

async function pedido(id: string, repartidor: string | null = null) {
  await pg.exec(`
    insert into public.ordenes (id, tenant_id, sucursal_id, mesa_id, canal, estado) values ('${id}','${T}','${S1}',null,'delivery_web','abierta');
    insert into public.orden_items (orden_id, producto_id, nombre_producto, cantidad, precio_unitario) values ('${id}','${PROD}','Tacos',2,50);
    insert into public.ordenes_delivery (orden_id, cliente_nombre, cliente_telefono, direccion_referencia, zona_id, tarifa_envio, metodo_pago, paga_con, repartidor_id)
      values ('${id}','Ana','99887766','Portón negro, frente a la pulpería','${ZONA}',30,'efectivo',200, ${repartidor ? `'${repartidor}'` : "null"});
  `);
}
const estado = (id: string, e: string, extra = "") =>
  pg.exec(`update public.ordenes_delivery set estado_delivery='${e}' ${extra} where orden_id='${id}'`);
const leer = async (id: string) =>
  (await pg.query<Record<string, unknown>>("select * from public.ordenes_delivery where orden_id=$1", [id])).rows[0];

beforeAll(async () => {
  pg = await crearBaseConMigraciones();
  await pg.exec(`
    insert into public.tenants (id, nombre) values ('${T}','Negocio'), ('${T2}','Otro');
    insert into public.sucursales (id, tenant_id, nombre) values ('${S1}','${T}','Centro'), ('${S2}','${T2}','Otra');
    insert into auth.users (id) values ('${ADMIN}'), ('${ADMIN2}'), ('${CAJERO}'), ('${COCINA}');
    insert into public.usuarios (id, tenant_id, sucursal_id, rol, nombre) values
      ('${ADMIN}','${T}',null,'admin','Admin'),
      ('${ADMIN2}','${T2}',null,'admin','Admin 2'),
      ('${CAJERO}','${T}','${S1}','cajero','Cajero'),
      ('${COCINA}','${T}','${S1}','cocina','Cocina');
    insert into public.productos (id, tenant_id, nombre, precio) values ('${PROD}','${T}','Tacos',50);
    insert into public.delivery_config (sucursal_id, activo, horario)
      values ('${S1}', true, '{"lun":[{"desde":"10:00","hasta":"22:00"}],"vie":[{"desde":"18:00","hasta":"02:00"}]}');
    insert into public.delivery_zonas (id, sucursal_id, nombre, tarifa) values ('${ZONA}','${S1}','Col. Trejo',30);
    insert into public.repartidores (id, sucursal_id, nombre, telefono, tipo_pago, monto_por_entrega)
      values ('${R1}','${S1}','Luis','98765432','por_entrega',25), ('${R2}','${S1}','Pedro','91234567','fijo',0);
  `);
});

describe("delivery_abierto (horario de Honduras, UTC-6)", () => {
  // 2026-06-01 es lunes; 2026-06-05 viernes
  const abierto = async (iso: string) =>
    (await pg.query<{ a: boolean }>("select public.delivery_abierto($1, $2::timestamptz) as a", [S1, iso])).rows[0].a;

  it("abierto dentro de horario y cerrado fuera", async () => {
    expect(await abierto("2026-06-01T18:00:00Z")).toBe(true); // 12:00 HN
    expect(await abierto("2026-06-02T05:00:00Z")).toBe(false); // lunes 23:00 HN
    expect(await abierto("2026-06-02T18:00:00Z")).toBe(false); // martes: sin horario
  });
  it("tramo que cruza la medianoche", async () => {
    expect(await abierto("2026-06-06T01:00:00Z")).toBe(true); // viernes 19:00 HN
    expect(await abierto("2026-06-06T05:00:00Z")).toBe(true); // viernes 23:00 HN
    expect(await abierto("2026-06-06T07:30:00Z")).toBe(true); // sábado 01:30 HN: sigue el tramo del viernes
    expect(await abierto("2026-06-06T08:30:00Z")).toBe(false); // sábado 02:30 HN: ya cerró
  });
  it("pausado manualmente = cerrado aunque esté en horario", async () => {
    await comoCajero(() => pg.exec(`select public.delivery_pausar('${S1}', true)`));
    expect(await abierto("2026-06-01T18:00:00Z")).toBe(false);
    await comoCajero(() => pg.exec(`select public.delivery_pausar('${S1}', false)`));
    expect(await abierto("2026-06-01T18:00:00Z")).toBe(true);
  });
  it("otro negocio no puede pausar mi sucursal", async () => {
    await expect(comoAdmin2(() => pg.exec(`select public.delivery_pausar('${S1}', true)`))).rejects.toThrow(/DELIVERY_SIN_PERMISO/);
  });
  it("slug reservado o inválido se rechaza", async () => {
    await expect(pg.exec(`update public.delivery_config set slug='admin' where sucursal_id='${S1}'`)).rejects.toThrow();
    await expect(pg.exec(`update public.delivery_config set slug='Mi Tienda' where sucursal_id='${S1}'`)).rejects.toThrow();
    await pg.exec(`update public.delivery_config set slug='fondita-centro' where sucursal_id='${S1}'`);
  });
});

describe("transiciones de estado (servidor)", () => {
  it("el flujo completo válido llena los timestamps y el efecto en la orden", async () => {
    await pedido(O1, R1);
    await estado(O1, "aceptado");
    await estado(O1, "en_cocina");
    let o = (await pg.query<{ estado: string }>("select estado from public.ordenes where id=$1", [O1])).rows[0];
    expect(o.estado).toBe("enviada");
    await estado(O1, "listo");
    expect((await pg.query<{ l: boolean }>("select lista_cocina as l from public.ordenes where id=$1", [O1])).rows[0].l).toBe(true);
    await estado(O1, "en_camino");
    await estado(O1, "entregado");
    const d = await leer(O1);
    for (const c of ["aceptado_at", "en_cocina_at", "listo_at", "en_camino_at", "entregado_at", "llegado_at"]) {
      expect(d[c], c).not.toBeNull();
    }
    // total = 2×50 + 30 de envío, cobrado por defecto completo y registrado como pago
    expect(d.monto_cobrado).toBe(130);
    const pagos = await pg.query<{ monto: number; forma_pago: string }>("select monto, forma_pago from public.pagos where orden_id=$1", [O1]);
    expect(pagos.rows).toEqual([{ monto: 130, forma_pago: "efectivo" }]);
    o = (await pg.query<{ estado: string }>("select estado from public.ordenes where id=$1", [O1])).rows[0];
    expect(o.estado).toBe("pagada");
  });

  it("transiciones inválidas se rechazan", async () => {
    await pedido(O2);
    await expect(estado(O2, "listo")).rejects.toThrow(/DELIVERY_TRANSICION/);
    await expect(estado(O2, "entregado")).rejects.toThrow(/DELIVERY_TRANSICION/);
    await estado(O2, "aceptado");
    await expect(estado(O2, "recibido")).rejects.toThrow(/DELIVERY_TRANSICION/);
    await expect(estado(O2, "en_camino")).rejects.toThrow(/DELIVERY_TRANSICION/);
  });

  it("no despacha sin repartidor", async () => {
    await estado(O2, "en_cocina");
    await estado(O2, "listo");
    await expect(estado(O2, "en_camino")).rejects.toThrow(/DELIVERY_SIN_REPARTIDOR/);
  });

  it("rechazar/cancelar exige motivo y cancela la orden; los estados finales no se mueven", async () => {
    await expect(estado(O2, "cancelado")).rejects.toThrow();
    await estado(O2, "cancelado", ", motivo_cancelacion='Cliente no contesta'");
    const o = (await pg.query<{ estado: string; m: string }>("select estado, motivo_cancelacion m from public.ordenes where id=$1", [O2])).rows[0];
    expect(o).toEqual({ estado: "cancelada", m: "Cliente no contesta" });
    await expect(estado(O2, "aceptado")).rejects.toThrow(/DELIVERY_TRANSICION/);
    await expect(pg.exec(`update public.ordenes_delivery set cliente_nombre='X' where orden_id='${O2}'`)).rejects.toThrow(/DELIVERY_TRANSICION/);
  });

  it("validaciones de datos: teléfono de 8 dígitos, referencia obligatoria, RTN de 14 dígitos", async () => {
    const id = "d0000000-0000-0000-0000-0000000000c9";
    await pg.exec(`insert into public.ordenes (id, tenant_id, sucursal_id, canal) values ('${id}','${T}','${S1}','delivery_telefono')`);
    const ins = (cols: string, vals: string) =>
      pg.exec(`insert into public.ordenes_delivery (orden_id, cliente_nombre, metodo_pago, ${cols}) values ('${id}','A','efectivo', ${vals})`);
    await expect(ins("cliente_telefono, direccion_referencia", "'123','Casa azul junto al parque'")).rejects.toThrow();
    await expect(ins("cliente_telefono, direccion_referencia", "'99887766',''")).rejects.toThrow();
    await expect(ins("cliente_telefono, direccion_referencia, tipo_factura, factura_rtn, factura_nombre", "'99887766','Casa azul junto al parque','con_rtn','123','X'")).rejects.toThrow();
    await ins("cliente_telefono, direccion_referencia, tipo_factura, factura_rtn, factura_nombre", "'99887766','Casa azul junto al parque','con_rtn','08011999123456','Empresa SA'");
  });

  it("una orden de salón no puede tener datos de delivery", async () => {
    const id = "d0000000-0000-0000-0000-0000000000ca";
    await pg.exec(`insert into public.mesas (id, tenant_id, sucursal_id, nombre) values ('${id}','${T}','${S1}','M1')`);
    await pg.exec(`insert into public.ordenes (id, tenant_id, sucursal_id, mesa_id) values ('${id}','${T}','${S1}','${id}')`);
    await expect(
      pg.exec(`insert into public.ordenes_delivery (orden_id, cliente_nombre, cliente_telefono, direccion_referencia, metodo_pago) values ('${id}','A','99887766','Casa azul grande','efectivo')`)
    ).rejects.toThrow(/DELIVERY_ORDEN/);
  });
});

describe("RLS: repartidor, cocina y aislamiento entre negocios", () => {
  const O3 = "d0000000-0000-0000-0000-0000000000c3";
  const O4 = "d0000000-0000-0000-0000-0000000000c4";
  beforeAll(async () => {
    await pedido(O3, R1);
    await pedido(O4, R2);
    await estado(O3, "aceptado");
    await estado(O3, "en_cocina");
    await estado(O3, "listo");
  });

  it("el repartidor solo ve sus pedidos asignados (y sus ítems)", async () => {
    const r = await comoRepartidor(pg, R1, async () => ({
      d: (await pg.query<{ orden_id: string }>("select orden_id from public.ordenes_delivery")).rows.map((x) => x.orden_id),
      o: (await pg.query<{ id: string }>("select id from public.ordenes")).rows.map((x) => x.id),
      i: (await pg.query<{ orden_id: string }>("select orden_id from public.orden_items")).rows.map((x) => x.orden_id),
    }));
    expect(r.d).not.toContain(O4);
    expect(r.d).toContain(O3);
    expect(r.o).not.toContain(O4);
    expect(new Set(r.i).has(O4)).toBe(false);
  });

  it("el repartidor no ve a otros repartidores, credenciales ni liquidaciones", async () => {
    const r = await comoRepartidor(pg, R1, async () => ({
      rep: (await pg.query("select id from public.repartidores")).rows.length,
      cred: (await pg.query("select * from public.repartidor_credenciales")).rows.length,
      liq: (await pg.query("select * from public.liquidaciones_repartidor")).rows.length,
    }));
    expect(r).toEqual({ rep: 1, cred: 0, liq: 0 });
  });

  it("el repartidor solo puede cambiar estado/entrega, y solo salir y entregar", async () => {
    await comoRepartidor(pg, R1, async () => {
      await expect(pg.exec(`update public.ordenes_delivery set tarifa_envio=0 where orden_id='${O3}'`)).rejects.toThrow(/DELIVERY_SOLO_ENTREGA/);
      await expect(pg.exec(`update public.ordenes_delivery set estado_delivery='cancelado', motivo_cancelacion='x' where orden_id='${O3}'`)).rejects.toThrow(/DELIVERY_SOLO_ENTREGA|DELIVERY_TRANSICION/);
      await pg.exec(`update public.ordenes_delivery set estado_delivery='en_camino' where orden_id='${O3}'`);
    });
    expect((await leer(O3)).estado_delivery).toBe("en_camino");
    // un pedido ajeno no se puede tocar (RLS: 0 filas)
    await comoRepartidor(pg, R1, async () => {
      const r = await pg.query(`update public.ordenes_delivery set estado_delivery='en_camino' where orden_id='${O4}' returning 1`);
      expect(r.rows.length).toBe(0);
    });
  });

  it("entregar desde el repartidor registra el pago aunque él no tenga acceso a pagos", async () => {
    await comoRepartidor(pg, R1, async () => {
      await pg.exec(`update public.ordenes_delivery set estado_delivery='entregado', monto_cobrado=130, entrega_lat=14.07, entrega_lng=-87.19 where orden_id='${O3}'`);
    });
    const p = await pg.query<{ monto: number }>("select monto from public.pagos where orden_id=$1", [O3]);
    expect(p.rows).toEqual([{ monto: 130 }]);
  });

  it("cocina no ve datos del cliente; otro negocio no ve nada", async () => {
    expect((await comoCocina(() => pg.query("select 1 from public.ordenes_delivery"))).rows.length).toBe(0);
    expect((await comoAdmin2(() => pg.query("select 1 from public.ordenes_delivery"))).rows.length).toBe(0);
    expect((await comoAdmin2(() => pg.query("select 1 from public.repartidores"))).rows.length).toBe(0);
    expect((await comoAdmin2(() => pg.query("select 1 from public.delivery_config"))).rows.length).toBe(0);
    expect((await comoCajero(() => pg.query("select 1 from public.ordenes_delivery"))).rows.length).toBeGreaterThan(0);
  });
});

describe("seguimiento por token", () => {
  it("token correcto devuelve el pedido sin exponer datos de más; incorrecto, null", async () => {
    const tok = (await pg.query<{ t: string }>("select tracking_token t from public.ordenes_delivery where orden_id=$1", [O1])).rows[0].t;
    expect(tok.length).toBeGreaterThanOrEqual(40);
    expect(tok).toMatch(/^[A-Za-z0-9_-]+$/);
    const r = (await pg.query<{ s: Record<string, unknown> | null }>("select public.seguimiento_pedido($1) s", [tok])).rows[0].s!;
    expect(r.estado).toBe("entregado");
    expect(r.total).toBe(130);
    expect(JSON.stringify(r)).not.toContain("99887766"); // teléfono del cliente no sale
    expect((r.repartidor as { telefono: unknown }).telefono).toBeNull(); // ya no está en camino
    for (const malo of ["x", "a".repeat(43), O1, ""]) {
      expect((await pg.query("select public.seguimiento_pedido($1) s", [malo])).rows[0]).toEqual({ s: null });
    }
  });
});

describe("rastro GPS y privacidad", () => {
  const O5 = "d0000000-0000-0000-0000-0000000000c5";
  const punto = (orden: string, rep: string, ev = "muestra", at = "now()") =>
    pg.exec(`insert into public.repartidor_rastro (orden_id, repartidor_id, lat, lng, precision_m, evento, registrado_at) values ('${orden}','${rep}',14.07,-87.19,12,'${ev}',${at})`);

  it("solo acepta puntos con el pedido en camino y del repartidor asignado", async () => {
    await pedido(O5, R1);
    await estado(O5, "aceptado");
    await estado(O5, "en_cocina");
    await estado(O5, "listo");
    await comoRepartidor(pg, R1, async () => {
      await expect(punto(O5, R1)).rejects.toThrow(/RASTRO_PRIVACIDAD/); // aún no salió
    });
    await estado(O5, "en_camino");
    await comoRepartidor(pg, R1, async () => {
      await punto(O5, R1, "salida");
    });
    await comoRepartidor(pg, R2, async () => {
      await expect(punto(O5, R2)).rejects.toThrow();
    });
    expect((await pg.query("select 1 from public.repartidor_rastro where orden_id=$1", [O5])).rows.length).toBe(1);
  });

  it("reintentos offline no duplican el mismo punto", async () => {
    await pg.exec(`insert into public.repartidor_rastro (orden_id, repartidor_id, lat, lng, evento, registrado_at)
      values ('${O5}','${R1}',14,-87,'llegada','2026-01-01T10:00:00Z')`);
    await expect(
      pg.exec(`insert into public.repartidor_rastro (orden_id, repartidor_id, lat, lng, evento, registrado_at)
        values ('${O5}','${R1}',14,-87,'llegada','2026-01-01T10:00:00Z')`)
    ).rejects.toThrow(/repartidor_rastro_unico|duplicate/i);
  });

  it("la retención borra lo viejo y conserva el punto de entrega", async () => {
    await pg.exec(`
      insert into public.repartidor_rastro (orden_id, repartidor_id, lat, lng, evento, registrado_at) values
        ('${O5}','${R1}',14,-87,'muestra', now() - interval '100 days'),
        ('${O5}','${R1}',14,-87,'entrega', now() - interval '100 days'),
        ('${O5}','${R1}',14,-87,'muestra', now() - interval '10 days')`);
    await pg.exec("delete from public.repartidor_rastro where registrado_at = '2026-01-01T10:00:00Z'");
    const borrados = (await pg.query<{ n: number }>("select public.purgar_rastro_delivery() n")).rows[0].n;
    expect(borrados).toBe(1);
    const ev = (await pg.query<{ evento: string }>("select evento from public.repartidor_rastro where registrado_at < now() - interval '50 days'")).rows;
    expect(ev).toEqual([{ evento: "entrega" }]);
  });

  it("el repartidor registra su aceptación de ubicación", async () => {
    await comoRepartidor(pg, R1, () => pg.exec("select public.repartidor_aceptar_ubicacion()"));
    expect((await pg.query<{ a: unknown }>("select aceptacion_ubicacion_at a from public.repartidores where id=$1", [R1])).rows[0].a).not.toBeNull();
  });
});

describe("login del repartidor con PIN", () => {
  beforeAll(async () => {
    await pg.exec(`insert into public.repartidor_credenciales (repartidor_id, pin_hash) values ('${R2}', public.repartidor_hash_pin('4321'))`);
  });
  const login = async (pin: string) =>
    (await pg.query<{ r: { ok: boolean; motivo?: string } }>("select public.repartidor_login($1, $2) r", [R2, pin])).rows[0].r;

  it("PIN correcto entra; el PIN no se guarda en claro", async () => {
    expect((await login("4321")).ok).toBe(true);
    const h = (await pg.query<{ h: string }>("select pin_hash h from public.repartidor_credenciales where repartidor_id=$1", [R2])).rows[0].h;
    expect(h).not.toContain("4321");
  });
  it("PIN con formato inválido no se puede crear", async () => {
    await expect(pg.query("select public.repartidor_hash_pin('12')")).rejects.toThrow(/PIN_INVALIDO/);
  });
  it("5 fallos bloquean 15 min, incluso con el PIN bueno", async () => {
    for (let i = 0; i < 5; i++) expect((await login("0000")).ok).toBe(false);
    expect(await login("4321")).toMatchObject({ ok: false, motivo: "bloqueado" });
    await pg.exec(`update public.repartidor_credenciales set bloqueado_hasta = now() - interval '1 minute' where repartidor_id='${R2}'`);
    expect((await login("4321")).ok).toBe(true);
  });
});

describe("liquidación", () => {
  it("la diferencia y el pago por envíos se calculan en el servidor y se cierra el turno", async () => {
    // O5 quedó en camino por el test de rastro: se entrega para poder liquidar
    await estado("d0000000-0000-0000-0000-0000000000c5", "entregado");
    // R1 tiene O1, O3 y O5 (efectivo, 130 c/u) entregados: 390 en efectivo, 3 × L25
    const calc = await comoCajero(async () =>
      (await pg.query<{ c: { total_efectivo_cobrado: number; total_pago_envios: number; total_pedidos: number } }>(
        "select public.calcular_liquidacion($1) c", [R1])).rows[0].c);
    expect(calc).toMatchObject({ total_efectivo_cobrado: 390, total_pago_envios: 75, total_pedidos: 3 });

    const cierre = await comoCajero(async () =>
      (await pg.query<{ r: { diferencia: number } }>("select public.cerrar_liquidacion($1, 380, 'faltó cambio') r", [R1])).rows[0].r);
    expect(cierre.diferencia).toBe(-10); // entregó 10 de menos

    const liq = (await pg.query<{ cerrada_por: string; total_entregado_en_caja: number }>(
      "select cerrada_por, total_entregado_en_caja from public.liquidaciones_repartidor")).rows[0];
    expect(liq).toEqual({ cerrada_por: CAJERO, total_entregado_en_caja: 380 });
    expect((await leer(O1)).liquidacion_id).not.toBeNull();
    // ya no hay nada por liquidar: no se puede cerrar dos veces
    await expect(comoCajero(() => pg.exec(`select public.cerrar_liquidacion('${R1}', 0)`))).rejects.toThrow(/LIQUIDACION_VACIA/);
  });

  it("otro negocio no puede ver ni liquidar", async () => {
    await expect(comoAdmin2(() => pg.exec(`select public.calcular_liquidacion('${R1}')`))).rejects.toThrow(/LIQUIDACION_SIN_PERMISO/);
    expect((await comoAdmin2(() => pg.query("select 1 from public.liquidaciones_repartidor"))).rows.length).toBe(0);
    expect((await comoCajero(() => pg.query("select 1 from public.liquidaciones_repartidor"))).rows.length).toBe(1);
  });

  it("no liquida con pedidos todavía en camino", async () => {
    const OX = "d0000000-0000-0000-0000-0000000000cc";
    await pedido(OX, R2);
    await estado(OX, "aceptado");
    await estado(OX, "en_cocina");
    await estado(OX, "listo");
    await estado(OX, "en_camino");
    await expect(comoCajero(() => pg.exec(`select public.cerrar_liquidacion('${R2}', 10)`))).rejects.toThrow(/LIQUIDACION_(PENDIENTES|VACIA)/);
  });
});

describe("rate limit", () => {
  it("permite hasta el máximo por ventana y bloquea después", async () => {
    const hit = async () => (await pg.query<{ ok: boolean }>("select public.delivery_rate_limit_hit('ip:1.2.3.4', 3, 600) ok")).rows[0].ok;
    expect([await hit(), await hit(), await hit(), await hit()]).toEqual([true, true, true, false]);
  });
});

describe("canal privado de la flota (Realtime Authorization)", () => {
  const conTopic = async <X,>(topic: string, fn: () => Promise<X>) => {
    await pg.exec(`select set_config('realtime.topic', '${topic}', false)`);
    try {
      return await fn();
    } finally {
      await pg.exec("select set_config('realtime.topic', '', false)");
    }
  };
  const puedeRecibir = (topic: string, quien: <X>(f: () => Promise<X>) => Promise<X>) =>
    conTopic(topic, () => quien(async () => {
      return (await pg.query("select 1 from realtime.messages where topic = realtime.topic()")).rows.length > 0;
    }));

  it("el personal de la sucursal recibe; cocina y otros negocios no", async () => {
    await pg.exec(`insert into realtime.messages (topic, extension) values ('flota:${S1}', 'broadcast')`);
    expect(await puedeRecibir(`flota:${S1}`, comoCajero)).toBe(true);
    expect(await puedeRecibir(`flota:${S1}`, comoCocina)).toBe(false);
    expect(await puedeRecibir(`flota:${S1}`, comoAdmin2)).toBe(false);
    expect(await puedeRecibir("otro:canal", comoCajero)).toBe(false);
  });

  it("solo el repartidor de esa sucursal puede enviar su posición", async () => {
    const enviar = (topic: string, rep: string) =>
      conTopic(topic, () => comoRepartidor(pg, rep, () => pg.exec(`insert into realtime.messages (topic, extension) values ('${topic}', 'broadcast')`)));
    await enviar(`flota:${S1}`, R1);
    await expect(enviar(`flota:${S2}`, R1)).rejects.toThrow(/row-level security/);
    await expect(conTopic(`flota:${S1}`, () => comoCajero(() => pg.exec(`insert into realtime.messages (topic, extension) values ('flota:${S1}', 'broadcast')`)))).rejects.toThrow(/row-level security/);
  });
});
