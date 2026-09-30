import "fake-indexeddb/auto";
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { crearBaseConMigraciones, comoUsuario } from "../sql/harness";
import { servidor } from "./servidorFalso";

vi.mock("@/lib/supabase/client", async () => {
  const m = await import("./servidorFalso");
  return { createClient: m.crearClienteFalso };
});

import { db } from "@/lib/offline/db";
import { flushOutbox } from "@/lib/offline/outbox";
import { emitirDocumentoFiscal, leerConfigFiscal } from "@/lib/fiscal/emision";
import { sincronizarFiscal, vincularDispositivoLocal } from "@/lib/fiscal/sincronizacion";

const T = "10000000-0000-0000-0000-000000000001";
const S = "10000000-0000-0000-0000-000000000002";
const CAJERO = "10000000-0000-0000-0000-000000000003";
const ADMIN = "10000000-0000-0000-0000-000000000004";
const MESA = "10000000-0000-0000-0000-000000000005";
const DISP = "10000000-0000-0000-0000-000000000006";
const CAI_1 = "A1B2C3-D4E5F6-A1B2C3-D4E5F6-A1B2C3-D4";
const CAI_2 = "112233-445566-778899-AABBCC-DDEEFF-01";

let pg: PGlite;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Vacía la cola esperando a que termine cualquier flush en curso (flushOutbox no espera a otro que ya corre). */
async function vaciar() {
  for (let i = 0; i < 100; i++) {
    await flushOutbox();
    if ((await db.outbox.count()) === 0) return;
    await sleep(15);
  }
  throw new Error("La cola no se vació");
}

async function ordenEnServidor(): Promise<string> {
  const id = crypto.randomUUID();
  await pg.query("insert into public.ordenes (id, tenant_id, sucursal_id, mesa_id, estado) values ($1,$2,$3,$4,'pagada')", [id, T, S, MESA]);
  return id;
}

async function sembrarRangos(rangos: { desde: number; hasta: number; cai?: string; estado?: string; fecha?: string }[]) {
  await pg.exec("truncate public.documentos_fiscales, public.incidentes_fiscales, public.cai_rangos cascade");
  await pg.query("update public.dispositivos_pos set vinculo_hash = null, vinculado_at = null");
  for (const r of rangos) {
    await pg.query(
      `insert into public.cai_rangos (tenant_id,sucursal_id,establecimiento,punto_emision,tipo_doc,cai,desde,hasta,fecha_limite,estado,dispositivo_id)
       values ($1,$2,'001','001','01',$3,$4,$5,$6,$7,$8)`,
      [T, S, r.cai ?? CAI_1, r.desde, r.hasta, r.fecha ?? "2099-12-31", r.estado ?? "pendiente", DISP]
    );
  }
}

async function emitir(n = 1) {
  const docs = [];
  for (let i = 0; i < n; i++) {
    docs.push(
      await emitirDocumentoFiscal({
        ordenId: await ordenEnServidor(), sucursalId: S, usuarioId: CAJERO,
        lineas: [{ nombre: "Tacos", cantidad: 1, precioUnitario: 115, tasa: "15" }],
      })
    );
  }
  return docs;
}

const rangosServidor = () =>
  pg.query<{ desde: number; estado: string; siguiente: number }>("select desde, estado, siguiente from public.cai_rangos order by desde").then((r) => r.rows);

beforeAll(async () => {
  vi.stubGlobal("navigator", { onLine: true, storage: { persist: async () => true } });
  pg = await crearBaseConMigraciones();
  servidor.pg = pg;
  servidor.userId = CAJERO;
  await pg.exec(`
    insert into public.tenants (id, nombre, facturacion_fiscal_activa, logo_url) values ('${T}','Negocio','true','https://x/tenant-logo.png');
    insert into public.sucursales (id, tenant_id, nombre, logo_url) values ('${S}','${T}','Suc','https://x/sucursal-logo.png');
    insert into auth.users (id) values ('${CAJERO}'), ('${ADMIN}');
    insert into public.usuarios (id, tenant_id, sucursal_id, rol, nombre) values
      ('${CAJERO}','${T}','${S}','cajero','Cajero'), ('${ADMIN}','${T}',null,'admin','Admin');
    insert into public.mesas (id, tenant_id, sucursal_id, nombre) values ('${MESA}','${T}','${S}','Mesa 1');
    insert into public.dispositivos_pos (id, tenant_id, sucursal_id, nombre, establecimiento, punto_emision)
      values ('${DISP}','${T}','${S}','Caja 1','001','001');
    insert into public.datos_fiscales_emisor (tenant_id, sucursal_id, razon_social, nombre_comercial, rtn, direccion_fiscal, telefono)
      values ('${T}', null, 'Negocio S.A.', 'Negocio', '08019999123456', 'Calle 1', '2222-0000');
    insert into public.datos_fiscales_emisor (tenant_id, sucursal_id, nombre_comercial, telefono)
      values ('${T}', '${S}', 'Negocio Centro', '9999-0000');
  `);
});

beforeEach(async () => {
  servidor.caido = false;
  servidor.userId = CAJERO;
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("emisión offline -> sincronización -> validación del servidor", () => {
  it("emite sin red, encola, y al volver la red el servidor valida y todo queda sincronizado", async () => {
    await sembrarRangos([{ desde: 1, hasta: 10, estado: "activo" }]);
    await vincularDispositivoLocal(DISP);

    servidor.caido = true;
    const docs = await emitir(3);
    expect(docs.map((d) => d.correlativo)).toEqual([1, 2, 3]);
    await sleep(50);
    expect(await db.outbox.count()).toBe(3);
    expect((await db.documentos_fiscales.toArray()).every((d) => d.sync_estado === "pendiente")).toBe(true);
    expect((await pg.query("select 1 from public.documentos_fiscales")).rows).toHaveLength(0);

    servidor.caido = false;
    await vaciar();

    expect((await db.documentos_fiscales.toArray()).every((d) => d.sync_estado === "sincronizado")).toBe(true);
    const enServidor = await pg.query<{ numero_completo: string }>("select numero_completo from public.documentos_fiscales order by correlativo");
    expect(enServidor.rows.map((r) => r.numero_completo)).toEqual(["001-001-01-00000001", "001-001-01-00000002", "001-001-01-00000003"]);
    expect((await rangosServidor())[0]).toMatchObject({ siguiente: 4, estado: "activo" });
    expect((await pg.query("select 1 from public.incidentes_fiscales")).rows).toHaveLength(0);
  });

  it("reintentar tras perder la respuesta no duplica el documento (idempotente)", async () => {
    await sembrarRangos([{ desde: 1, hasta: 10, estado: "activo" }]);
    await vincularDispositivoLocal(DISP);
    const [doc] = await emitir(1);
    await vaciar();

    // el dispositivo cree que no llegó y lo vuelve a enviar
    const { sync_estado: _a, sync_detalle: _b, ...payload } = (await db.documentos_fiscales.get(doc.id))!;
    void _a;
    void _b;
    await db.outbox.add({ id: crypto.randomUUID(), tabla: "documentos_fiscales", operacion: "insert", registro_id: doc.id, payload: payload as never, creado_en: new Date().toISOString(), intentos: 0, ultimo_error: null });
    await vaciar();

    expect((await pg.query("select 1 from public.documentos_fiscales")).rows).toHaveLength(1);
    expect((await pg.query("select 1 from public.incidentes_fiscales")).rows).toHaveLength(0);
    expect((await db.documentos_fiscales.get(doc.id))?.sync_estado).toBe("sincronizado");
  });

  it("CONFLICTO: dos cajas emiten el mismo número -> incidente en el servidor, el doc queda 'conflicto' y la cola sigue", async () => {
    await sembrarRangos([{ desde: 1, hasta: 10, estado: "activo" }]);
    await vincularDispositivoLocal(DISP);
    const [primero] = await emitir(1);
    await vaciar();
    expect(primero.sync_estado).toBe("pendiente"); // (la copia en memoria es la de la emisión)

    // Caja "clonada" que perdió su correlativo y vuelve a emitir el #1
    await db.rangos_cai.toCollection().modify({ siguiente: 1 });
    const [repetido, siguiente] = await emitir(2);
    expect(repetido.correlativo).toBe(1);
    expect(siguiente.correlativo).toBe(2);
    await vaciar();

    expect((await db.documentos_fiscales.get(repetido.id))).toMatchObject({ sync_estado: "conflicto" });
    expect((await db.documentos_fiscales.get(repetido.id))?.sync_detalle).toMatch(/duplicado/);
    // el que venía detrás NO quedó bloqueado por el conflicto
    expect((await db.documentos_fiscales.get(siguiente.id))?.sync_estado).toBe("sincronizado");
    expect(await db.outbox.count()).toBe(0);

    const incidentes = await pg.query<{ tipo: string; payload: { id: string } }>("select tipo, payload from public.incidentes_fiscales");
    expect(incidentes.rows).toHaveLength(1);
    expect(incidentes.rows[0]).toMatchObject({ tipo: "duplicado" });
    expect(incidentes.rows[0].payload.id).toBe(repetido.id); // queda el documento completo para revisarlo
    // el documento en conflicto NO entró al servidor
    expect((await pg.query("select 1 from public.documentos_fiscales where id = $1", [repetido.id])).rows).toHaveLength(0);
  });

  it("dispositivo reinstalado: arranca en max(servidor)+1, no reusa números ya emitidos", async () => {
    await sembrarRangos([{ desde: 1, hasta: 100, estado: "activo" }]);
    await vincularDispositivoLocal(DISP);
    await emitir(5);
    await vaciar();

    // Reinstalación: se pierde TODO el IndexedDB
    await Promise.all(db.tables.map((t) => t.clear()));
    await pg.query("update public.dispositivos_pos set vinculo_hash = null, vinculado_at = null"); // el admin liberó la caja
    await vincularDispositivoLocal(DISP);

    expect((await db.rangos_cai.toArray())[0].siguiente).toBe(6);
    const [nuevo] = await emitir(1);
    expect(nuevo.correlativo).toBe(6);
    await vaciar();
    expect((await pg.query("select 1 from public.incidentes_fiscales")).rows).toHaveLength(0);
  });

  it("aunque el rango del servidor esté desactualizado, el máximo emitido manda", async () => {
    await sembrarRangos([{ desde: 1, hasta: 100, estado: "activo" }]);
    await vincularDispositivoLocal(DISP);
    await emitir(4);
    await vaciar();
    // el contador del servidor se quedó atrás (p. ej. restauración parcial); los documentos siguen ahí
    await pg.query("alter table public.cai_rangos disable trigger trg_cai_rangos_before_write");
    await pg.query("update public.cai_rangos set siguiente = 2");
    await pg.query("alter table public.cai_rangos enable trigger trg_cai_rangos_before_write");

    await Promise.all(db.tables.map((t) => t.clear()));
    await pg.query("update public.dispositivos_pos set vinculo_hash = null");
    await vincularDispositivoLocal(DISP);
    expect((await db.rangos_cai.toArray())[0].siguiente).toBe(5);
  });

  it("el rango pendiente se activa solo al agotarse el activo, offline, y el servidor lo alcanza al sincronizar", async () => {
    await sembrarRangos([
      { desde: 1, hasta: 2, estado: "activo", cai: CAI_1 },
      { desde: 3, hasta: 5, estado: "pendiente", cai: CAI_2 },
    ]);
    await vincularDispositivoLocal(DISP);

    servidor.caido = true;
    const docs = await emitir(3);
    expect(docs.map((d) => [d.correlativo, d.cai])).toEqual([[1, CAI_1], [2, CAI_1], [3, CAI_2]]);

    servidor.caido = false;
    await vaciar();
    expect(await rangosServidor()).toEqual([
      { desde: 1, estado: "agotado", siguiente: 3 },
      { desde: 3, estado: "activo", siguiente: 4 },
    ]);
    expect((await pg.query("select 1 from public.incidentes_fiscales")).rows).toHaveLength(0);
  });
});

describe("sincronizarFiscal: configuración, emisor, logo y vinculación", () => {
  it("baja el flag, el emisor (con override de sucursal campo por campo) y el logo de la sucursal", async () => {
    await sembrarRangos([{ desde: 1, hasta: 10, estado: "activo" }]);
    await vincularDispositivoLocal(DISP);
    const cfg = await leerConfigFiscal();

    expect(cfg?.activa).toBe(true);
    expect(cfg?.dispositivo).toMatchObject({ id: DISP, establecimiento: "001", punto_emision: "001" });
    expect(cfg?.emisor).toMatchObject({
      razon_social: "Negocio S.A.", // del tenant (la sucursal no la sobrescribe)
      nombre_comercial: "Negocio Centro", // override de la sucursal
      telefono: "9999-0000", // override de la sucursal
      rtn: "08019999123456",
      logo_url: "https://x/sucursal-logo.png", // el de la sucursal manda sobre el del negocio
    });
    expect((await db.rangos_cai.toArray())[0]).toMatchObject({ desde: 1, hasta: 10, siguiente: 1, estado: "activo" });
  });

  it("sin logo en la sucursal usa el del negocio", async () => {
    await pg.query("update public.sucursales set logo_url = null");
    await sembrarRangos([{ desde: 1, hasta: 10, estado: "activo" }]);
    await vincularDispositivoLocal(DISP);
    expect((await leerConfigFiscal())?.emisor?.logo_url).toBe("https://x/tenant-logo.png");
    await pg.query("update public.sucursales set logo_url = 'https://x/sucursal-logo.png'");
  });

  it("si el admin libera la caja, en la próxima sincronización pierde la vinculación y no puede facturar", async () => {
    await sembrarRangos([{ desde: 1, hasta: 10, estado: "activo" }]);
    await vincularDispositivoLocal(DISP);
    await pg.query("update public.dispositivos_pos set vinculo_hash = null, vinculado_at = null");
    await sincronizarFiscal(S, T);
    expect((await leerConfigFiscal())?.dispositivo).toBeNull();
    await expect(emitir(1)).rejects.toMatchObject({ codigo: "sin_dispositivo" });
  });

  it("otro navegador no puede vincularse a un punto ya vinculado", async () => {
    await sembrarRangos([{ desde: 1, hasta: 10, estado: "activo" }]);
    await vincularDispositivoLocal(DISP);
    // otro navegador: token distinto
    await db.config.delete("dispositivo_token");
    await expect(vincularDispositivoLocal(DISP)).rejects.toThrow(/ya está vinculado/);
  });

  it("sin red, sincronizar no rompe nada y conserva lo cacheado", async () => {
    await sembrarRangos([{ desde: 1, hasta: 10, estado: "activo" }]);
    await vincularDispositivoLocal(DISP);
    servidor.caido = true;
    await sincronizarFiscal(S, T);
    expect((await leerConfigFiscal())?.dispositivo?.id).toBe(DISP);
    expect(await db.rangos_cai.count()).toBe(1);
  });
});

describe("documentos bajados del servidor", () => {
  it("los de otra caja se consideran ya impresos (reimprimir sale REIMPRESIÓN); los propios sin imprimir siguen siendo 'original'", async () => {
    await sembrarRangos([{ desde: 1, hasta: 10, estado: "activo" }]);
    await vincularDispositivoLocal(DISP);

    // Un documento emitido por OTRA caja y ya en el servidor
    const ordenAjena = await ordenEnServidor();
    const [propio] = await emitir(1);
    await vaciar();

    const ajeno = { ...(await db.documentos_fiscales.get(propio.id))!, id: crypto.randomUUID(), orden_id: ordenAjena, correlativo: 2, numero_completo: "001-001-01-00000002" };
    const { sync_estado: _a, sync_detalle: _b, impreso_at: _c, ...payload } = ajeno;
    void _a; void _b; void _c;
    await comoUsuario(pg, CAJERO, () => pg.query("select public.sincronizar_documento_fiscal($1::jsonb)", [JSON.stringify(payload)]));

    await sincronizarFiscal(S, T);

    expect((await db.documentos_fiscales.get(ajeno.id))?.impreso_at).toBeTruthy(); // ya salió en otra caja
    expect((await db.documentos_fiscales.get(propio.id))?.impreso_at).toBeFalsy(); // el propio nunca imprimió aquí
  });
});
