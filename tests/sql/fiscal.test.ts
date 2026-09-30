import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { crearBaseConMigraciones, comoUsuario } from "./harness";

const T_A = "aaaaaaaa-0000-0000-0000-00000000000a";
const T_B = "bbbbbbbb-0000-0000-0000-00000000000b";
const S_A = "aaaaaaaa-1111-0000-0000-00000000000a";
const S_B = "bbbbbbbb-1111-0000-0000-00000000000b";
const ADMIN_A = "aaaaaaaa-2222-0000-0000-00000000000a";
const CAJERO_A = "aaaaaaaa-3333-0000-0000-00000000000a";
const ADMIN_B = "bbbbbbbb-2222-0000-0000-00000000000b";
const MESA_A = "aaaaaaaa-4444-0000-0000-00000000000a";

const CAI = "A1B2C3-D4E5F6-A1B2C3-D4E5F6-A1B2C3-D4";
const CAI2 = "112233-445566-778899-AABBCC-DDEEFF-01";

let pg: PGlite;
let ordenSeq = 0;

async function nuevaOrden(): Promise<string> {
  ordenSeq++;
  const id = `aaaaaaaa-5555-0000-0000-${String(ordenSeq).padStart(12, "0")}`;
  await pg.query(
    "insert into public.ordenes (id, tenant_id, sucursal_id, mesa_id, estado) values ($1,$2,$3,$4,'pagada')",
    [id, T_A, S_A, MESA_A]
  );
  return id;
}

async function crearRango(over: Partial<Record<string, unknown>> = {}) {
  const r = {
    tenant_id: T_A, sucursal_id: S_A, establecimiento: "001", punto_emision: "001",
    tipo_doc: "01", clase: "factura", cai: CAI, desde: 1, hasta: 3, fecha_limite: "2099-12-31",
    estado: "pendiente", ...over,
  };
  const res = await pg.query<{ id: string }>(
    `insert into public.cai_rangos (tenant_id,sucursal_id,establecimiento,punto_emision,tipo_doc,clase,cai,desde,hasta,fecha_limite,estado)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
    [r.tenant_id, r.sucursal_id, r.establecimiento, r.punto_emision, r.tipo_doc, r.clase, r.cai, r.desde, r.hasta, r.fecha_limite, r.estado]
  );
  return res.rows[0].id;
}

async function estados(): Promise<Record<number, string>> {
  const r = await pg.query<{ desde: number; estado: string }>(
    "select desde, estado from public.cai_rangos where tenant_id=$1 and establecimiento='001' and punto_emision='001' order by desde",
    [T_A]
  );
  return Object.fromEntries(r.rows.map((x) => [x.desde, x.estado]));
}

async function doc(over: Record<string, unknown> = {}) {
  const orden_id = (over.orden_id as string) ?? (await nuevaOrden());
  const correlativo = (over.correlativo as number) ?? 1;
  return {
    id: crypto.randomUUID(), tenant_id: T_A, sucursal_id: S_A, orden_id,
    dispositivo_id: null, usuario_id: CAJERO_A, clase: "factura", tipo_doc: "01",
    establecimiento: "001", punto_emision: "001", correlativo,
    numero_completo: `001-001-01-${String(correlativo).padStart(8, "0")}`,
    cai: CAI, rango_desde: 1, rango_hasta: 3, fecha_limite: "2099-12-31",
    fecha_emision: new Date().toISOString(), emisor_snapshot: { razon_social: "X" },
    cliente_nombre: "Consumidor Final", cliente_rtn: null,
    importe_exonerado: 0, importe_exento: 0, gravado_15: 100, gravado_18: 0, isv_15: 15, isv_18: 0, cargo_servicio: 0,
    total: 115, total_letras: "CIENTO QUINCE LEMPIRAS CON 00/100", lineas: [],
    ...over,
  };
}

const sync = (d: unknown) =>
  comoUsuario(pg, CAJERO_A, async () => {
    const r = await pg.query<{ r: { ok: boolean; tipo?: string; duplicado_idempotente?: boolean } }>(
      "select public.sincronizar_documento_fiscal($1::jsonb) as r", [JSON.stringify(d)]
    );
    return r.rows[0].r;
  });

function docDeOtroTenant() {
  return {
    id: crypto.randomUUID(), tenant_id: T_A, sucursal_id: S_A, orden_id: crypto.randomUUID(),
    tipo_doc: "01", establecimiento: "001", punto_emision: "001", correlativo: 1,
    numero_completo: "001-001-01-00000001", cai: CAI, rango_desde: 1, rango_hasta: 3,
    fecha_limite: "2099-12-31", fecha_emision: new Date().toISOString(), emisor_snapshot: {},
    total: 0, total_letras: "CERO", lineas: [],
  };
}

beforeAll(async () => {
  pg = await crearBaseConMigraciones();
  await pg.exec(`
    insert into public.tenants (id, nombre) values ('${T_A}','Negocio A'), ('${T_B}','Negocio B');
    insert into public.sucursales (id, tenant_id, nombre) values ('${S_A}','${T_A}','Suc A'), ('${S_B}','${T_B}','Suc B');
    insert into auth.users (id) values ('${ADMIN_A}'), ('${CAJERO_A}'), ('${ADMIN_B}');
    insert into public.usuarios (id, tenant_id, sucursal_id, rol, nombre) values
      ('${ADMIN_A}','${T_A}',null,'admin','Admin A'),
      ('${CAJERO_A}','${T_A}','${S_A}','cajero','Cajero A'),
      ('${ADMIN_B}','${T_B}',null,'admin','Admin B');
    insert into public.mesas (id, tenant_id, sucursal_id, nombre) values ('${MESA_A}','${T_A}','${S_A}','Mesa 1');
  `);
});

describe("rangos CAI: reglas de datos", () => {
  it("rechaza CAI con formato inválido y normaliza a mayúsculas", async () => {
    await expect(crearRango({ cai: "no-es-un-cai" })).rejects.toThrow();
    const id = await crearRango({ cai: CAI.toLowerCase(), desde: 1000, hasta: 1001, establecimiento: "009", punto_emision: "009" });
    const r = await pg.query<{ cai: string }>("select cai from public.cai_rangos where id=$1", [id]);
    expect(r.rows[0].cai).toBe(CAI);
  });

  it("rechaza desde > hasta y traslapes en el mismo punto/tipo", async () => {
    await expect(crearRango({ desde: 10, hasta: 5, establecimiento: "002" })).rejects.toThrow();
    await crearRango(); // 1-3 (queda activo: no había ninguno)
    await expect(crearRango({ desde: 3, hasta: 6 })).rejects.toThrow(/sin_traslape|traslape|exclusion|conflicting/i);
    await crearRango({ punto_emision: "002" }); // otro punto sí se permite
  });

  it("solo puede haber un rango activo por punto; el pendiente se activa solo si no hay activo", async () => {
    expect((await estados())[1]).toBe("activo");
    await crearRango({ desde: 4, hasta: 6, cai: CAI2 });
    expect(await estados()).toEqual({ 1: "activo", 4: "pendiente" });
    await expect(
      pg.query("update public.cai_rangos set estado='activo' where desde=4 and establecimiento='001' and punto_emision='001'")
    ).rejects.toThrow(/cai_rangos_un_activo|duplicate/i);
  });

  it("nace 'vencido' si la fecha límite ya pasó", async () => {
    const id = await crearRango({ desde: 50, hasta: 60, fecha_limite: "2020-01-01", establecimiento: "003", punto_emision: "003" });
    const r = await pg.query<{ estado: string }>("select estado from public.cai_rangos where id=$1", [id]);
    expect(r.rows[0].estado).toBe("vencido");
  });
});

describe("sincronizar_documento_fiscal", () => {
  it("guarda un documento válido, avanza el contador del servidor y es idempotente", async () => {
    const d = await doc({ correlativo: 1 });
    expect(await sync(d)).toMatchObject({ ok: true });
    expect(await sync(d)).toMatchObject({ ok: true, duplicado_idempotente: true });
    const r = await pg.query<{ siguiente: number }>("select siguiente from public.cai_rangos where desde=1 and establecimiento='001' and punto_emision='001'");
    expect(r.rows[0].siguiente).toBe(2);
  });

  it("duplicado del mismo correlativo con otro id => incidente, no se descarta en silencio", async () => {
    const r = await sync(await doc({ correlativo: 1 }));
    expect(r).toMatchObject({ ok: false, tipo: "duplicado" });
    const inc = await pg.query("select tipo, payload from public.incidentes_fiscales where tipo='duplicado'");
    expect(inc.rows.length).toBe(1);
  });

  it("correlativo fuera del rango => incidente fuera_de_rango", async () => {
    const r = await sync(await doc({ correlativo: 9 }));
    expect(r).toMatchObject({ ok: false, tipo: "fuera_de_rango" });
  });

  it("CAI que no existe => incidente rango_desconocido", async () => {
    const r = await sync(await doc({ correlativo: 2, cai: CAI2 }));
    expect(r).toMatchObject({ ok: false, tipo: "rango_desconocido" });
  });

  it("emitido después de la fecha límite => incidente fecha_vencida", async () => {
    await crearRango({ desde: 100, hasta: 110, cai: CAI2, establecimiento: "004", punto_emision: "004", fecha_limite: "2030-01-01" });
    const r = await sync(await doc({
      correlativo: 100, establecimiento: "004", punto_emision: "004", cai: CAI2, rango_desde: 100, rango_hasta: 110,
      fecha_emision: "2030-01-02T18:00:00Z",
    }));
    expect(r).toMatchObject({ ok: false, tipo: "fecha_vencida" });
  });

  it("el último día se puede emitir hasta el final del día local de Honduras", async () => {
    // 2030-01-02T05:59Z = 2030-01-01 23:59 en Tegucigalpa (UTC-6): aún dentro del plazo
    const r = await sync(await doc({
      correlativo: 100, establecimiento: "004", punto_emision: "004", cai: CAI2, rango_desde: 100, rango_hasta: 110,
      numero_completo: "004-004-01-00000100",
      fecha_emision: "2030-01-02T05:59:00Z",
    }));
    expect(r).toMatchObject({ ok: true });
  });

  it("total que no cuadra con base+ISV => incidente datos_invalidos", async () => {
    const r = await sync(await doc({ correlativo: 2, total: 120 }));
    expect(r).toMatchObject({ ok: false, tipo: "datos_invalidos" });
  });

  it("número completo mal formado => incidente numero_invalido", async () => {
    const r = await sync(await doc({ correlativo: 2, numero_completo: "001-001-01-00000099" }));
    expect(r).toMatchObject({ ok: false, tipo: "numero_invalido" });
  });

  it("al emitirse el último correlativo el rango pasa a agotado y se activa el pendiente", async () => {
    expect(await sync(await doc({ correlativo: 2 }))).toMatchObject({ ok: true });
    expect(await sync(await doc({ correlativo: 3 }))).toMatchObject({ ok: true });
    expect(await estados()).toEqual({ 1: "agotado", 4: "activo" });
  });

  it("si el dispositivo ya usó el rango pendiente (agotó offline), el servidor lo alcanza", async () => {
    await crearRango({ desde: 7, hasta: 9, cai: CAI, establecimiento: "001", punto_emision: "001" });
    expect(await estados()).toMatchObject({ 4: "activo", 7: "pendiente" });
    const d = await doc({ correlativo: 7, rango_desde: 7, rango_hasta: 9 });
    expect(await sync(d)).toMatchObject({ ok: true });
    expect(await estados()).toMatchObject({ 4: "agotado", 7: "activo" });
  });

  it("max_correlativo_fiscal devuelve el máximo emitido del punto", async () => {
    const r = await comoUsuario(pg, CAJERO_A, () =>
      pg.query<{ m: number }>("select public.max_correlativo_fiscal('001','001','01') as m")
    );
    expect(r.rows[0].m).toBe(7);
  });
});

describe("inmutabilidad y anulación", () => {
  let docId: string;
  beforeAll(async () => {
    const r = await pg.query<{ id: string }>(
      "select id from public.documentos_fiscales where correlativo=1 and punto_emision='001' and establecimiento='001'"
    );
    docId = r.rows[0].id;
  });

  it("nadie puede editar ni borrar un documento emitido (ni el dueño de la tabla)", async () => {
    await expect(pg.query("update public.documentos_fiscales set total = 1 where id=$1", [docId])).rejects.toThrow(/INMUTABLE/);
    await expect(pg.query("delete from public.documentos_fiscales where id=$1", [docId])).rejects.toThrow(/INMUTABLE/);
    await expect(
      pg.query("update public.documentos_fiscales set estado='anulada', total=1, anulada_motivo='x', anulada_at=now() where id=$1", [docId])
    ).rejects.toThrow(/INMUTABLE/);
  });

  it("el cajero no puede anular; el admin sí, y el documento conserva su número", async () => {
    await expect(
      comoUsuario(pg, CAJERO_A, () => pg.query("select public.anular_documento_fiscal($1, 'x')", [docId]))
    ).rejects.toThrow(/SOLO_ADMIN/);
    await expect(
      comoUsuario(pg, ADMIN_A, () => pg.query("select public.anular_documento_fiscal($1, '  ')", [docId]))
    ).rejects.toThrow(/MOTIVO_REQUERIDO/);
    await comoUsuario(pg, ADMIN_A, () => pg.query("select public.anular_documento_fiscal($1, 'Error de captura')", [docId]));
    const r = await pg.query<{ estado: string; numero_completo: string; anulada_por: string }>(
      "select estado, numero_completo, anulada_por from public.documentos_fiscales where id=$1", [docId]
    );
    expect(r.rows[0]).toMatchObject({ estado: "anulada", numero_completo: "001-001-01-00000001", anulada_por: ADMIN_A });
    await expect(
      comoUsuario(pg, ADMIN_A, () => pg.query("select public.anular_documento_fiscal($1, 'otra vez')", [docId]))
    ).rejects.toThrow(/YA_ANULADO/);
  });

  it("tras anular, el número anulado no se puede reusar", async () => {
    const ord = (await pg.query<{ orden_id: string }>("select orden_id from public.documentos_fiscales where id=$1", [docId])).rows[0].orden_id;
    expect(await sync(await doc({ orden_id: ord, correlativo: 1 }))).toMatchObject({ ok: false, tipo: "duplicado" });
  });

  it("no se puede bajar ni editar el correlativo de un rango, ni cambiar o borrar un rango en uso", async () => {
    await expect(
      comoUsuario(pg, ADMIN_A, () => pg.query("update public.cai_rangos set siguiente = 1 where desde = 1 and establecimiento='001' and punto_emision='001'"))
    ).rejects.toThrow(/RETROCEDE/);
    await expect(
      comoUsuario(pg, ADMIN_A, () => pg.query("update public.cai_rangos set siguiente = 9 where desde = 7 and establecimiento='001' and punto_emision='001'"))
    ).rejects.toThrow(/AUTOMATICO/);
    await expect(
      pg.query("update public.cai_rangos set hasta = 99 where desde = 1 and establecimiento='001' and punto_emision='001'")
    ).rejects.toThrow(/EN_USO/);
    await expect(
      pg.query("delete from public.cai_rangos where desde = 1 and establecimiento='001' and punto_emision='001'")
    ).rejects.toThrow(/EN_USO/);
  });
});

describe("RLS multi-tenant", () => {
  it("un tenant no lee rangos, documentos ni incidentes de otro", async () => {
    const [rangos, docs, inc] = await comoUsuario(pg, ADMIN_B, async () => [
      await pg.query("select 1 from public.cai_rangos"),
      await pg.query("select 1 from public.documentos_fiscales"),
      await pg.query("select 1 from public.incidentes_fiscales"),
    ]);
    expect(rangos.rows.length).toBe(0);
    expect(docs.rows.length).toBe(0);
    expect(inc.rows.length).toBe(0);
  });

  it("un tenant no puede escribir rangos en otro tenant", async () => {
    const insertar = (tenant: string, sucursal: string) =>
      comoUsuario(pg, ADMIN_B, () =>
        pg.query(
          `insert into public.cai_rangos (tenant_id,sucursal_id,establecimiento,punto_emision,tipo_doc,cai,desde,hasta,fecha_limite)
           values ($1,$2,'005','005','01',$3,1,5,'2099-12-31')`, [tenant, sucursal, CAI]
        )
      );
    await expect(insertar(T_A, S_A)).rejects.toThrow(/row-level security|SUCURSAL_INVALIDA/i);
    await expect(insertar(T_B, S_A)).rejects.toThrow(/SUCURSAL_INVALIDA/);
  });

  it("un tenant no puede sincronizar documentos a nombre de otro", async () => {
    await expect(
      comoUsuario(pg, ADMIN_B, () =>
        pg.query("select public.sincronizar_documento_fiscal($1::jsonb)", [JSON.stringify(docDeOtroTenant())])
      )
    ).rejects.toThrow(/TENANT_INVALIDO/);
  });

  it("el cliente no puede insertar/editar/borrar documentos directo (solo por RPC)", async () => {
    await expect(comoUsuario(pg, ADMIN_A, () => pg.query("delete from public.documentos_fiscales"))).rejects.toThrow(/permission denied/i);
    await expect(comoUsuario(pg, ADMIN_A, () => pg.query("update public.documentos_fiscales set total=0"))).rejects.toThrow(/permission denied/i);
  });

  it("el cajero ve los rangos de su sucursal pero no los modifica ni lee incidentes", async () => {
    const rangos = await comoUsuario(pg, CAJERO_A, () => pg.query("select 1 from public.cai_rangos"));
    expect(rangos.rows.length).toBeGreaterThan(0);
    const upd = await comoUsuario(pg, CAJERO_A, () => pg.query("update public.cai_rangos set estado='vencido'"));
    expect(upd.affectedRows).toBe(0);
    const inc = await comoUsuario(pg, CAJERO_A, () => pg.query("select 1 from public.incidentes_fiscales"));
    expect(inc.rows.length).toBe(0);
  });
});

describe("dispositivos: un punto de emisión, un navegador", () => {
  it("dos dispositivos no pueden compartir punto de emisión", async () => {
    await pg.query("insert into public.dispositivos_pos (tenant_id,sucursal_id,nombre,establecimiento,punto_emision) values ($1,$2,'Caja 1','001','010')", [T_A, S_A]);
    await expect(
      pg.query("insert into public.dispositivos_pos (tenant_id,sucursal_id,nombre,establecimiento,punto_emision) values ($1,$2,'Caja 2','001','010')", [T_A, S_A])
    ).rejects.toThrow(/unique|duplicate/i);
  });

  it("vincula con un token y otro navegador no puede robar el punto", async () => {
    const { rows } = await pg.query<{ id: string }>("select id from public.dispositivos_pos where punto_emision='010'");
    const id = rows[0].id;
    const t1 = "11111111-1111-1111-1111-111111111111";
    const t2 = "22222222-2222-2222-2222-222222222222";
    await comoUsuario(pg, CAJERO_A, () => pg.query("select public.vincular_dispositivo($1,$2)", [id, t1]));
    await comoUsuario(pg, CAJERO_A, () => pg.query("select public.vincular_dispositivo($1,$2)", [id, t1]));
    await expect(
      comoUsuario(pg, CAJERO_A, () => pg.query("select public.vincular_dispositivo($1,$2)", [id, t2]))
    ).rejects.toThrow(/YA_VINCULADO/);
    await comoUsuario(pg, ADMIN_A, () => pg.query("update public.dispositivos_pos set vinculo_hash=null, vinculado_at=null where id=$1", [id]));
    await comoUsuario(pg, CAJERO_A, () => pg.query("select public.vincular_dispositivo($1,$2)", [id, t2]));
  });

  it("un dispositivo de otro tenant no se puede vincular", async () => {
    const { rows } = await pg.query<{ id: string }>("select id from public.dispositivos_pos where punto_emision='010'");
    await expect(
      comoUsuario(pg, ADMIN_B, () => pg.query("select public.vincular_dispositivo($1,$2)", [rows[0].id, "33333333-3333-3333-3333-333333333333"]))
    ).rejects.toThrow(/NO_DISPONIBLE/);
  });
});

describe("tasa de ISV por producto", () => {
  it("el servidor copia la tasa del producto al insertar el ítem, aunque el cliente mande otra", async () => {
    const prod = "aaaaaaaa-6666-0000-0000-00000000000a";
    await pg.query("insert into public.productos (id, tenant_id, nombre, precio, tasa_isv) values ($1,$2,'Cerveza',59,'18')", [prod, T_A]);
    const orden = await nuevaOrden();
    await pg.query(
      "insert into public.orden_items (orden_id, producto_id, nombre_producto, cantidad, precio_unitario, tasa_isv) values ($1,$2,'Cerveza',1,59,'15')",
      [orden, prod]
    );
    const r = await pg.query<{ tasa_isv: string }>("select tasa_isv from public.orden_items where orden_id=$1", [orden]);
    expect(r.rows[0].tasa_isv).toBe("18");
  });

  it("solo acepta exento, 15 o 18", async () => {
    await expect(
      pg.query("insert into public.productos (tenant_id, nombre, precio, tasa_isv) values ($1,'X',1,'12')", [T_A])
    ).rejects.toThrow();
  });
});

describe("notas de crédito", () => {
  // Punto 006-006 aparte para no chocar con los demás tests
  const EST = "006";
  const CAI_FACT = "AAAAAA-BBBBBB-CCCCCC-DDDDDD-EEEEEE-01";
  const CAI_NC = "AAAAAA-BBBBBB-CCCCCC-DDDDDD-EEEEEE-03";
  let factura: Awaited<ReturnType<typeof doc>>;

  const base = (correlativo: number, over: Record<string, unknown> = {}) =>
    doc({
      establecimiento: EST, punto_emision: EST, correlativo, cai: CAI_FACT, rango_desde: 1, rango_hasta: 50,
      numero_completo: `${EST}-${EST}-01-${String(correlativo).padStart(8, "0")}`, ...over,
    });

  const nota = (correlativo: number, over: Record<string, unknown> = {}) =>
    doc({
      establecimiento: EST, punto_emision: EST, tipo_doc: "03", clase: "nota_credito", correlativo, cai: CAI_NC,
      rango_desde: 1, rango_hasta: 20, numero_completo: `${EST}-${EST}-03-${String(correlativo).padStart(8, "0")}`,
      documento_referencia_id: factura.id, motivo_nota: "Devolución", ...over,
    });

  beforeAll(async () => {
    await crearRango({ establecimiento: EST, punto_emision: EST, tipo_doc: "01", cai: CAI_FACT, desde: 1, hasta: 50 });
    await crearRango({ establecimiento: EST, punto_emision: EST, tipo_doc: "03", clase: "nota_credito", cai: CAI_NC, desde: 1, hasta: 20 });
    factura = await base(1);
    expect(await sync(factura)).toMatchObject({ ok: true });
  });

  it("una nota de crédito válida se sincroniza con su referencia y motivo", async () => {
    expect(await sync(await nota(1))).toMatchObject({ ok: true });
    const r = await pg.query<{ clase: string; documento_referencia_id: string; motivo_nota: string }>(
      "select clase, documento_referencia_id, motivo_nota from public.documentos_fiscales where tipo_doc='03' and establecimiento=$1", [EST]
    );
    expect(r.rows[0]).toMatchObject({ clase: "nota_credito", documento_referencia_id: factura.id, motivo_nota: "Devolución" });
  });

  it("la misma factura no se puede acreditar dos veces", async () => {
    expect(await sync(await nota(2))).toMatchObject({ ok: false, tipo: "duplicado" });
  });

  it("una nota sin factura de referencia se rechaza", async () => {
    expect(await sync(await nota(3, { documento_referencia_id: null }))).toMatchObject({ ok: false, tipo: "datos_invalidos" });
  });

  it("no puede ser mayor que la factura", async () => {
    const f2 = await base(2);
    expect(await sync(f2)).toMatchObject({ ok: true });
    const r = await sync(await nota(3, { documento_referencia_id: f2.id, total: 200, gravado_15: 173.91, isv_15: 26.09 }));
    expect(r).toMatchObject({ ok: false, tipo: "nota_excede" });
  });

  it("no se puede acreditar una factura anulada", async () => {
    const f3 = await base(3);
    expect(await sync(f3)).toMatchObject({ ok: true });
    await comoUsuario(pg, ADMIN_A, () => pg.query("select public.anular_documento_fiscal($1, 'Error')", [f3.id]));
    expect(await sync(await nota(3, { documento_referencia_id: f3.id }))).toMatchObject({ ok: false, tipo: "referencia_anulada" });
  });

  it("no puede referirse a una factura de otro negocio ni a otra nota", async () => {
    expect(await sync(await nota(3, { documento_referencia_id: crypto.randomUUID() }))).toMatchObject({ ok: false });
    const nc1 = (await pg.query<{ id: string }>("select id from public.documentos_fiscales where tipo_doc='03' and establecimiento=$1 and correlativo=1", [EST])).rows[0].id;
    expect(await sync(await nota(3, { documento_referencia_id: nc1 }))).toMatchObject({ ok: false, tipo: "referencia_invalida" });
  });

  it("un documento en su propia numeración no consume la de la factura", async () => {
    const r = await pg.query<{ tipo_doc: string; siguiente: number }>(
      "select tipo_doc, siguiente from public.cai_rangos where establecimiento=$1 order by tipo_doc", [EST]
    );
    expect(r.rows.map((x) => [x.tipo_doc, x.siguiente])).toEqual([["01", 4], ["03", 2]]);
  });
});

describe("notas de crédito entre negocios", () => {
  it("el negocio B no puede emitir una nota que referencie una factura del negocio A", async () => {
    const MESA_B = "bbbbbbbb-4444-0000-0000-00000000000b";
    const ORDEN_B = "bbbbbbbb-5555-0000-0000-00000000000b";
    const CAI_B = "BBBBBB-BBBBBB-BBBBBB-BBBBBB-BBBBBB-03";
    await pg.exec(`
      insert into public.mesas (id, tenant_id, sucursal_id, nombre) values ('${MESA_B}','${T_B}','${S_B}','M1');
      insert into public.ordenes (id, tenant_id, sucursal_id, mesa_id, estado) values ('${ORDEN_B}','${T_B}','${S_B}','${MESA_B}','pagada');
      insert into public.cai_rangos (tenant_id, sucursal_id, establecimiento, punto_emision, tipo_doc, clase, cai, desde, hasta, fecha_limite)
        values ('${T_B}','${S_B}','001','001','03','nota_credito','${CAI_B}',1,10,'2099-12-31');
    `);
    const facturaDeA = (await pg.query<{ id: string }>("select id from public.documentos_fiscales where clase='factura' and estado='emitida' limit 1")).rows[0].id;

    const r = await comoUsuario(pg, ADMIN_B, async () =>
      (await pg.query<{ r: { ok: boolean; tipo?: string } }>("select public.sincronizar_documento_fiscal($1::jsonb) as r", [
        JSON.stringify({
          id: crypto.randomUUID(), tenant_id: T_B, sucursal_id: S_B, orden_id: ORDEN_B, clase: "nota_credito", tipo_doc: "03",
          establecimiento: "001", punto_emision: "001", correlativo: 1, numero_completo: "001-001-03-00000001", cai: CAI_B,
          rango_desde: 1, rango_hasta: 10, fecha_limite: "2099-12-31", fecha_emision: new Date().toISOString(),
          emisor_snapshot: {}, cliente_nombre: "X", total: 0, total_letras: "CERO", lineas: [], documento_referencia_id: facturaDeA,
        }),
      ])).rows[0].r
    );
    expect(r).toMatchObject({ ok: false, tipo: "referencia_invalida" });
  });
});
