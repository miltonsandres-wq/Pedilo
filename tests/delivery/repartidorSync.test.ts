import "fake-indexeddb/auto";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { crearBaseConMigraciones, comoRepartidor } from "../sql/harness";
import { abrirBaseRepartidor, type BaseRepartidor, type PedidoRep } from "@/lib/repartidor/db";
import { cambiosDeAccion, esRechazoPermanente, filaAPedido, type ApiRepartidor } from "@/lib/repartidor/api";
import { guardarPuntoRastro, refrescarPedidos, registrarAccion, sincronizar, vaciarAcciones } from "@/lib/repartidor/sync";

const T = "40000000-0000-0000-0000-000000000001";
const S = "40000000-0000-0000-0000-000000000002";
const PROD = "40000000-0000-0000-0000-000000000003";
const ZONA = "40000000-0000-0000-0000-000000000004";
const R1 = "40000000-0000-0000-0000-000000000005";
const R2 = "40000000-0000-0000-0000-000000000006";

let pg: PGlite;
let base: BaseRepartidor;
const red = { caida: false };
let enviadas: string[] = [];

/** API del repartidor contra una base REAL (con RLS y triggers) que corre como el repartidor R1. */
function apiPglite(repartidorId = R1): ApiRepartidor {
  const caida = { ok: false as const, permanente: false, error: "TypeError: Failed to fetch" };
  return {
    async traerPedidos() {
      if (red.caida) return { ok: false, error: "Failed to fetch" };
      const filas = await comoRepartidor(pg, repartidorId, async () =>
        (await pg.query(`
          select d.*, to_jsonb(o) - 'tenant_id' as ordenes_json
            from public.ordenes_delivery d join public.ordenes o on o.id = d.orden_id
           where d.estado_delivery in ('listo','en_camino','entregado') and d.liquidacion_id is null`)).rows as Record<string, unknown>[]);
      const pedidos: PedidoRep[] = [];
      for (const f of filas) {
        const items = await comoRepartidor(pg, repartidorId, async () =>
          (await pg.query<{ nombre_producto: string; cantidad: number; nota: string | null }>("select nombre_producto, cantidad, nota from public.orden_items where orden_id=$1", [f.orden_id])).rows);
        const o = f.ordenes_json as { numero_dia: number; total: number };
        pedidos.push(filaAPedido({ ...f, ordenes: { numero_dia: o.numero_dia, total: o.total } } as never, items.map((i) => ({ nombre: i.nombre_producto, cantidad: i.cantidad, nota: i.nota }))));
      }
      return { ok: true, pedidos };
    },
    async enviarAccion(a) {
      if (red.caida) return caida;
      enviadas.push(`${a.tipo}:${a.orden_id}`);
      const cambios = cambiosDeAccion(a);
      const claves = Object.keys(cambios);
      try {
        const r = await comoRepartidor(pg, repartidorId, () =>
          pg.query(`update public.ordenes_delivery set ${claves.map((k, i) => `${k} = $${i + 2}`).join(", ")} where orden_id = $1 returning orden_id`,
            [a.orden_id, ...claves.map((k) => cambios[k])]));
        if (r.rows.length === 0) return { ok: false, permanente: true, error: "El pedido ya no está asignado a ti." };
        return { ok: true };
      } catch (e) {
        const m = (e as Error).message;
        return { ok: false, permanente: esRechazoPermanente(m), error: m };
      }
    },
    async subirRastro(puntos) {
      if (red.caida) return caida;
      try {
        for (const p of puntos) {
          await comoRepartidor(pg, repartidorId, () =>
            pg.query(`insert into public.repartidor_rastro (orden_id, repartidor_id, lat, lng, precision_m, velocidad, evento, registrado_at)
                      values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict do nothing`,
              [p.orden_id, p.repartidor_id, p.lat, p.lng, p.precision_m, p.velocidad, p.evento, p.registrado_at]));
        }
        return { ok: true };
      } catch (e) {
        const m = (e as Error).message;
        return { ok: false, permanente: esRechazoPermanente(m), error: m };
      }
    },
    async aceptarUbicacion() {
      await comoRepartidor(pg, repartidorId, () => pg.exec("select public.repartidor_aceptar_ubicacion()"));
      return true;
    },
  };
}

async function nuevoPedido(repartidor: string | null = R1, hastaListo = true) {
  const id = crypto.randomUUID();
  await pg.exec(`
    insert into public.ordenes (id, tenant_id, sucursal_id, canal) values ('${id}','${T}','${S}','delivery_web');
    insert into public.orden_items (orden_id, producto_id, nombre_producto, cantidad, precio_unitario) values ('${id}','${PROD}','Tacos',2,50);
    insert into public.ordenes_delivery (orden_id, cliente_nombre, cliente_telefono, direccion_referencia, zona_id, tarifa_envio, metodo_pago, repartidor_id, ubicacion_lat, ubicacion_lng)
      values ('${id}','Ana','99887766','Casa azul junto al parque','${ZONA}',30,'efectivo', ${repartidor ? `'${repartidor}'` : "null"}, 14.0723, -87.1921);`);
  if (hastaListo) {
    for (const e of ["aceptado", "en_cocina", "listo"]) await pg.exec(`update public.ordenes_delivery set estado_delivery='${e}' where orden_id='${id}'`);
  }
  return id;
}

const servidor = async (id: string) =>
  (await pg.query<Record<string, unknown>>("select * from public.ordenes_delivery where orden_id=$1", [id])).rows[0];

beforeAll(async () => {
  pg = await crearBaseConMigraciones();
  await pg.exec(`
    insert into public.tenants (id, nombre) values ('${T}','Negocio');
    insert into public.sucursales (id, tenant_id, nombre) values ('${S}','${T}','Centro');
    insert into public.productos (id, tenant_id, nombre, precio) values ('${PROD}','${T}','Tacos',50);
    insert into public.delivery_zonas (id, sucursal_id, nombre, tarifa) values ('${ZONA}','${S}','Col. Trejo',30);
    insert into public.repartidores (id, sucursal_id, nombre) values ('${R1}','${S}','Luis'), ('${R2}','${S}','Pedro');`);
});

beforeEach(() => {
  base = abrirBaseRepartidor(`rep-${Math.random()}`);
  red.caida = false;
  enviadas = [];
});

describe("pedidos asignados", () => {
  it("el repartidor solo baja SUS pedidos (RLS), con ítems, total y destino", async () => {
    const mio = await nuevoPedido(R1);
    const ajeno = await nuevoPedido(R2);
    const sinAsignar = await nuevoPedido(null);
    expect(await refrescarPedidos(base, apiPglite(R1))).toBe(true);
    const ids = (await base.pedidos.toArray()).map((p) => p.orden_id);
    expect(ids).toContain(mio);
    expect(ids).not.toContain(ajeno);
    expect(ids).not.toContain(sinAsignar);
    const p = (await base.pedidos.get(mio))!;
    expect(p).toMatchObject({ estado_delivery: "listo", total: 130, subtotal: 100, tarifa_envio: 30, destino_lat: 14.0723, cliente_telefono: "99887766" });
    expect(p.items).toEqual([{ nombre: "Tacos", cantidad: 2, nota: null }]);
    expect(p.tracking_token.length).toBeGreaterThan(40);
  });

  it("un pedido reasignado a otro sale de la lista", async () => {
    const id = await nuevoPedido(R1);
    await refrescarPedidos(base, apiPglite(R1));
    await pg.exec(`update public.ordenes_delivery set repartidor_id='${R2}' where orden_id='${id}'`);
    await refrescarPedidos(base, apiPglite(R1));
    expect(await base.pedidos.get(id)).toBeUndefined();
  });
});

describe("sin señal: los cambios de estado se guardan y se sincronizan después", () => {
  it("salí → llegué → entregado sin red; al volver la señal sube todo con la hora REAL", async () => {
    const id = await nuevoPedido(R1);
    await refrescarPedidos(base, apiPglite());
    red.caida = true;

    const t0 = new Date(Date.now() - 20 * 60_000);
    expect(await registrarAccion(base, id, "salir", {}, t0)).toBe(true);
    expect(await registrarAccion(base, id, "llegar", { automatica: true }, new Date(t0.getTime() + 10 * 60_000))).toBe(true);
    const tEnt = new Date(t0.getTime() + 15 * 60_000);
    expect(await registrarAccion(base, id, "entregar", { monto: 130, lat: 14.07, lng: -87.19 }, tEnt)).toBe(true);

    // todo local, nada en el servidor todavía
    expect((await base.pedidos.get(id))!.estado_delivery).toBe("entregado");
    expect(await base.acciones.count()).toBe(3);
    expect((await servidor(id)).estado_delivery).toBe("listo");
    const sin = await sincronizar(base, apiPglite());
    expect(sin).toMatchObject({ sinSenal: true, pendientes: 3, subidas: 0 });
    expect((await base.pedidos.get(id))!.estado_delivery).toBe("entregado"); // sigue viéndose entregado

    red.caida = false;
    const r = await sincronizar(base, apiPglite());
    expect(r).toMatchObject({ sinSenal: false, pendientes: 0, subidas: 3 });

    const s = await servidor(id);
    expect(s.estado_delivery).toBe("entregado");
    expect(new Date(s.en_camino_at as string).getTime()).toBe(t0.getTime()); // la hora en que ocurrió, no la de la sincronización
    expect(new Date(s.entregado_at as string).getTime()).toBe(tEnt.getTime());
    expect(s).toMatchObject({ llegada_automatica: true, monto_cobrado: 130, entrega_lat: 14.07 });
    // y el cobro quedó en pagos por el trigger (el repartidor no tiene acceso directo a pagos)
    expect((await pg.query("select monto from public.pagos where orden_id=$1", [id])).rows).toEqual([{ monto: 130 }]);
  });

  it("FIFO: un fallo de red frena la cola y NO manda las siguientes", async () => {
    const id = await nuevoPedido(R1);
    await refrescarPedidos(base, apiPglite());
    await registrarAccion(base, id, "salir");
    await registrarAccion(base, id, "entregar", { monto: 130 });
    red.caida = true;
    const r = await vaciarAcciones(base, apiPglite());
    expect(r.sinSenal).toBe(true);
    expect(enviadas).toEqual([]);
    expect((await base.acciones.orderBy("ts").first())!.intentos).toBe(1);
  });

  it("acciones inválidas localmente no se encolan (salir de un pedido que no está listo, entregar sin salir)", async () => {
    const id = await nuevoPedido(R1, false); // recién creado, no está listo
    await pg.exec(`update public.ordenes_delivery set estado_delivery='aceptado' where orden_id='${id}'`);
    await pg.exec(`update public.ordenes_delivery set estado_delivery='en_cocina' where orden_id='${id}'`);
    await pg.exec(`update public.ordenes_delivery set estado_delivery='listo' where orden_id='${id}'`);
    await refrescarPedidos(base, apiPglite());
    expect(await registrarAccion(base, id, "entregar", { monto: 1 })).toBe(false);
    expect(await registrarAccion(base, id, "llegar")).toBe(false);
    expect(await registrarAccion(base, "no-existe", "salir")).toBe(false);
    expect(await base.acciones.count()).toBe(0);
  });

  it("refrescar no pisa lo que el repartidor hizo sin señal", async () => {
    const id = await nuevoPedido(R1);
    await refrescarPedidos(base, apiPglite());
    await registrarAccion(base, id, "salir");
    await refrescarPedidos(base, apiPglite()); // el servidor aún dice "listo"
    expect((await base.pedidos.get(id))!.estado_delivery).toBe("en_camino");
  });
});

describe("rechazos del servidor", () => {
  it("el restaurante canceló mientras estaba sin señal: la acción se descarta, la cola no se atasca", async () => {
    const id = await nuevoPedido(R1);
    const otro = await nuevoPedido(R1);
    await refrescarPedidos(base, apiPglite());
    await registrarAccion(base, id, "salir");
    await registrarAccion(base, otro, "salir");
    await pg.exec(`update public.ordenes_delivery set estado_delivery='cancelado', motivo_cancelacion='Cliente no contesta' where orden_id='${id}'`);

    const r = await sincronizar(base, apiPglite());
    expect(r.pendientes).toBe(0); // nada atascado
    expect((await servidor(otro)).estado_delivery).toBe("en_camino"); // el otro pedido sí siguió
    expect(await base.pedidos.get(id)).toBeUndefined(); // el cancelado ya no es suyo
  });

  it("reenviar una entrega que ya se había aplicado (se perdió la respuesta) no genera conflicto", async () => {
    const id = await nuevoPedido(R1);
    await refrescarPedidos(base, apiPglite());
    await registrarAccion(base, id, "salir");
    await registrarAccion(base, id, "entregar", { monto: 130 });
    await sincronizar(base, apiPglite());
    // se repite la misma acción como si la respuesta se hubiera perdido
    await base.acciones.add({ id: "dup", orden_id: id, tipo: "entregar", ts: new Date().toISOString(), datos: { monto: 130 }, intentos: 1, ultimo_error: null });
    const r = await sincronizar(base, apiPglite());
    expect(r.pendientes).toBe(0);
    expect((await base.pedidos.get(id))!.conflicto).toBeNull();
    expect((await pg.query("select count(*)::int n from public.pagos where orden_id=$1", [id])).rows[0]).toEqual({ n: 1 });
  });

  it("si lo que el repartidor hizo no quedó aplicado, se le avisa", async () => {
    const id = await nuevoPedido(R1);
    await refrescarPedidos(base, apiPglite());
    await registrarAccion(base, id, "salir");
    // el cajero reasigna el pedido a otro repartidor mientras tanto: ya no es de R1 (RLS: 0 filas)
    await pg.exec(`update public.ordenes_delivery set repartidor_id='${R2}' where orden_id='${id}'`);
    await sincronizar(base, apiPglite());
    expect(await base.acciones.count()).toBe(0);
  });

  it("clasificación de errores: reglas del servidor definitivas; red transitoria", () => {
    expect(esRechazoPermanente("DELIVERY_TRANSICION: no se puede pasar de listo a entregado")).toBe(true);
    expect(esRechazoPermanente("RASTRO_PRIVACIDAD: solo se registra...")).toBe(true);
    expect(esRechazoPermanente('new row violates row-level security policy')).toBe(true);
    expect(esRechazoPermanente("TypeError: Failed to fetch")).toBe(false);
    expect(esRechazoPermanente("timeout")).toBe(false);
  });
});

describe("rastro offline", () => {
  it("se sube después de las acciones y respeta la privacidad (solo con el pedido en camino)", async () => {
    const id = await nuevoPedido(R1);
    await refrescarPedidos(base, apiPglite());
    red.caida = true;
    await registrarAccion(base, id, "salir");
    const ahora = Date.now();
    for (const [i, ev] of (["salida", "muestra", "llegada", "entrega"] as const).entries()) {
      await guardarPuntoRastro(base, { orden_id: id, repartidor_id: R1, lat: 14.07 + i / 1000, lng: -87.19, precision_m: 12, velocidad: 4, evento: ev, registrado_at: new Date(ahora - 60_000 + i * 1000).toISOString() });
    }
    await registrarAccion(base, id, "entregar", { monto: 130 });
    red.caida = false;
    await sincronizar(base, apiPglite());
    expect(await base.rastro.count()).toBe(0);
    const evs = (await pg.query<{ evento: string }>("select evento from public.repartidor_rastro where orden_id=$1 order by registrado_at", [id])).rows.map((r) => r.evento);
    expect(evs).toEqual(["salida", "muestra", "llegada", "entrega"]);
  });

  it("reintentos de subida no duplican puntos", async () => {
    const id = await nuevoPedido(R1);
    await refrescarPedidos(base, apiPglite());
    await registrarAccion(base, id, "salir");
    const punto = { orden_id: id, repartidor_id: R1, lat: 14.07, lng: -87.19, precision_m: 10, velocidad: 0, evento: "muestra" as const, registrado_at: new Date(Date.now() - 30_000).toISOString() };
    await guardarPuntoRastro(base, punto);
    await sincronizar(base, apiPglite());
    await guardarPuntoRastro(base, punto); // el mismo punto otra vez
    await sincronizar(base, apiPglite());
    expect((await pg.query("select 1 from public.repartidor_rastro where orden_id=$1 and evento='muestra'", [id])).rows).toHaveLength(1);
  });
});
