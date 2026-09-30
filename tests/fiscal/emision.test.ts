import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db, type RangoCaiLocal, type OrdenLocal, type OrdenItemLocal } from "@/lib/offline/db";
import { CLAVE_CONFIG_FISCAL, emitirDocumentoFiscal, verificarPuedeFacturar, type ConfigFiscalLocal } from "@/lib/fiscal/emision";
import { FiscalError } from "@/lib/fiscal/rangos";
import { cobrar } from "@/lib/pos/acciones";

const CAI_1 = "A1B2C3-D4E5F6-A1B2C3-D4E5F6-A1B2C3-D4";
const CAI_2 = "112233-445566-778899-AABBCC-DDEEFF-01";

const EMISOR = {
  razon_social: "Taquería Doña Rosa S. de R.L.",
  nombre_comercial: "Taquería Doña Rosa",
  rtn: "08019999123456",
  direccion_fiscal: "Col. Palmira, Tegucigalpa",
  telefono: "2222-3333",
  correo: "rosa@example.com",
  logo_url: null,
};

function config(over: Partial<ConfigFiscalLocal> = {}): ConfigFiscalLocal {
  return {
    activa: true,
    tenantId: "T1",
    emisor: EMISOR,
    dispositivo: { id: "D1", nombre: "Caja 1", sucursal_id: "S1", establecimiento: "001", punto_emision: "001" },
    ...over,
  };
}

function rango(over: Partial<RangoCaiLocal> = {}): RangoCaiLocal {
  return {
    id: "R1", tenant_id: "T1", sucursal_id: "S1", establecimiento: "001", punto_emision: "001",
    tipo_doc: "01", clase: "factura", cai: CAI_1, desde: 1, hasta: 100, siguiente: 1,
    fecha_limite: "2099-12-31", estado: "activo", dispositivo_id: "D1", ...over,
  };
}

async function sembrar(cfg: ConfigFiscalLocal | null, rangos: RangoCaiLocal[] = [rango()]) {
  if (cfg) await db.config.put({ clave: CLAVE_CONFIG_FISCAL, valor: cfg });
  await db.rangos_cai.bulkPut(rangos);
}

const lineas = [{ nombre: "Tacos", cantidad: 2, precioUnitario: 115, tasa: "15" as const }];

function datos(ordenId: string, over = {}) {
  return { ordenId, sucursalId: "S1", usuarioId: "U1", lineas, ...over };
}

let seq = 0;
async function nuevaOrden(items: Partial<OrdenItemLocal>[] = [{ nombre_producto: "Tacos", cantidad: 2, precio_unitario: 115, tasa_isv: "15" }]) {
  seq++;
  const id = `O${seq}`;
  const total = items.reduce((a, i) => a + (i.cantidad ?? 1) * (i.precio_unitario ?? 0), 0);
  const orden: OrdenLocal = {
    id, sucursal_id: "S1", mesa_id: `M${seq}`, usuario_id: "U1", estado: "enviada", total,
    cliente_nombre: null, personas: null, numero_dia: 1, lista_cocina: false,
    created_at: new Date().toISOString(), enviada_at: null, pagada_at: null, cancelada_at: null, motivo_cancelacion: null,
  };
  await db.ordenes.add(orden);
  await db.mesas.add({ id: `M${seq}`, sucursal_id: "S1", nombre: `Mesa ${seq}`, capacidad: 4, zona: null, pos_x: null, pos_y: null, estado: "ocupada", activa: true });
  for (const [k, i] of items.entries()) {
    await db.orden_items.add({
      id: `${id}-I${k}`, orden_id: id, producto_id: "P1", nombre_producto: "X", cantidad: 1, precio_unitario: 0,
      nota: null, impreso: true, origen_cliente: false, created_at: new Date().toISOString(), ...i,
    });
  }
  return id;
}

async function nada() {
  return {
    docs: await db.documentos_fiscales.count(),
    outbox: await db.outbox.count(),
    pagos: await db.pagos.count(),
  };
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("emitirDocumentoFiscal", () => {
  it("asigna el correlativo, arma el número, congela el emisor y el rango, y lo encola", async () => {
    await sembrar(config());
    const doc = await emitirDocumentoFiscal(datos("O-A"));

    expect(doc).toMatchObject({
      numero_completo: "001-001-01-00000001", correlativo: 1, cai: CAI_1, rango_desde: 1, rango_hasta: 100,
      fecha_limite: "2099-12-31", clase: "factura", cliente_nombre: "Consumidor Final", cliente_rtn: null,
      gravado_15: 200, isv_15: 30, total: 230, total_letras: "DOSCIENTOS TREINTA LEMPIRAS CON 00/100",
      estado: "emitida", sync_estado: "pendiente", dispositivo_id: "D1",
    });
    expect(doc.emisor_snapshot).toMatchObject({ razon_social: EMISOR.razon_social, rtn: EMISOR.rtn });
    expect((await db.rangos_cai.get("R1"))?.siguiente).toBe(2);

    const cola = await db.outbox.toArray();
    expect(cola).toHaveLength(1);
    expect(cola[0]).toMatchObject({ tabla: "documentos_fiscales", operacion: "insert", registro_id: doc.id });
    expect(cola[0].payload).not.toHaveProperty("sync_estado");
    expect(cola[0].payload).toMatchObject({ numero_completo: "001-001-01-00000001" });
  });

  it("dos cobros rápidos en el mismo dispositivo NO repiten correlativo (25 en paralelo)", async () => {
    await sembrar(config());
    const docs = await Promise.all(Array.from({ length: 25 }, (_, i) => emitirDocumentoFiscal(datos(`O-${i}`))));

    const numeros = docs.map((d) => d.correlativo).sort((a, b) => a - b);
    expect(numeros).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    expect(new Set(docs.map((d) => d.numero_completo)).size).toBe(25);
    expect((await db.rangos_cai.get("R1"))?.siguiente).toBe(26);
    expect(await db.outbox.count()).toBe(25);
  });

  it("factura con RTN y exoneración", async () => {
    await sembrar(config());
    const conRtn = await emitirDocumentoFiscal(datos("O-B", { cliente: { nombre: "Juan Pérez", rtn: "0801-1999-123456" } }));
    expect(conRtn).toMatchObject({ cliente_nombre: "Juan Pérez", cliente_rtn: "08011999123456" });

    const exo = await emitirDocumentoFiscal(
      datos("O-C", { exoneracion: { noConstanciaExonerado: "CE-123", noRegistroSag: "SAG-9" }, cliente: { nombre: "Embajada", rtn: "08011999123456" } })
    );
    expect(exo).toMatchObject({
      importe_exonerado: 230, gravado_15: 0, isv_15: 0, total: 230,
      no_constancia_exonerado: "CE-123", no_registro_sag: "SAG-9", no_orden_compra_exenta: null,
    });
  });

  describe("bloqueos: no hay modo permisivo y no se escribe nada", () => {
    async function bloquea(codigo: string) {
      const antes = await nada();
      const rangoAntes = await db.rangos_cai.toArray();
      await expect(emitirDocumentoFiscal(datos("O-X"))).rejects.toMatchObject({ codigo });
      await expect(emitirDocumentoFiscal(datos("O-X"))).rejects.toBeInstanceOf(FiscalError);
      expect(await nada()).toEqual(antes);
      expect(await db.rangos_cai.toArray()).toEqual(rangoAntes);
    }

    it("sin dispositivo vinculado", async () => {
      await sembrar(config({ dispositivo: null }));
      await bloquea("sin_dispositivo");
    });
    it("sin datos fiscales del emisor", async () => {
      await sembrar(config({ emisor: { ...EMISOR, rtn: null } }));
      await bloquea("sin_emisor");
    });
    it("sin rango cacheado (offline sin CAI)", async () => {
      await sembrar(config(), []);
      await bloquea("sin_rango");
    });
    it("rangos de otro punto de emisión no sirven", async () => {
      await sembrar(config(), [rango({ punto_emision: "002" })]);
      await bloquea("sin_rango");
    });
    it("rango agotado", async () => {
      await sembrar(config(), [rango({ siguiente: 101 })]);
      await bloquea("rango_agotado");
    });
    it("fecha límite vencida", async () => {
      await sembrar(config(), [rango({ fecha_limite: "2020-01-01" })]);
      await bloquea("rango_vencido");
    });
  });

  it("auto-activa el rango pendiente cuando el activo se agota, sin saltar ni repetir números", async () => {
    await sembrar(config(), [
      rango({ id: "R1", desde: 1, hasta: 2 }),
      rango({ id: "R2", desde: 3, hasta: 5, siguiente: 3, estado: "pendiente", cai: CAI_2 }),
    ]);
    const d1 = await emitirDocumentoFiscal(datos("O-1"));
    const d2 = await emitirDocumentoFiscal(datos("O-2"));
    expect((await db.rangos_cai.get("R1"))?.estado).toBe("agotado");
    expect((await db.rangos_cai.get("R2"))?.estado).toBe("activo");
    const d3 = await emitirDocumentoFiscal(datos("O-3"));

    expect([d1.correlativo, d2.correlativo, d3.correlativo]).toEqual([1, 2, 3]);
    expect(d2.cai).toBe(CAI_1);
    expect(d3).toMatchObject({ cai: CAI_2, rango_desde: 3, rango_hasta: 5, numero_completo: "001-001-01-00000003" });
  });

  it("verificarPuedeFacturar avisa sin escribir, y no bloquea si el negocio no factura", async () => {
    await sembrar(config(), [rango({ siguiente: 101 })]);
    expect((await verificarPuedeFacturar())?.codigo).toBe("rango_agotado");
    await db.config.put({ clave: CLAVE_CONFIG_FISCAL, valor: config({ activa: false }) });
    expect(await verificarPuedeFacturar()).toBeNull();
    expect((await db.rangos_cai.get("R1"))?.siguiente).toBe(101);
  });
});

describe("cobrar() con facturación fiscal", () => {
  it("pago completo: cierra la orden y emite la factura en la misma transacción", async () => {
    await sembrar(config());
    const ordenId = await nuevaOrden([
      { nombre_producto: "Tacos", cantidad: 2, precio_unitario: 115, tasa_isv: "15" },
      { nombre_producto: "Cerveza", cantidad: 1, precio_unitario: 59, tasa_isv: "18" },
      { nombre_producto: "Agua", cantidad: 1, precio_unitario: 20, tasa_isv: "exento" },
    ]);
    const { documentoId } = await cobrar({
      ordenId, mesaId: "M" + seq, usuarioId: "U1", monto: 309, formaPago: "efectivo",
      cliente: { nombre: "Ana López", rtn: "08011999123456" },
    });

    expect(documentoId).toBeTruthy();
    const doc = await db.documentos_fiscales.get(documentoId!);
    expect(doc).toMatchObject({
      orden_id: ordenId, numero_completo: "001-001-01-00000001", cliente_nombre: "Ana López",
      importe_exento: 20, gravado_15: 200, isv_15: 30, gravado_18: 50, isv_18: 9, total: 309,
    });
    expect((await db.ordenes.get(ordenId))?.estado).toBe("pagada");
    expect((await db.mesas.get("M" + seq))?.estado).toBe("libre");
    expect((await db.outbox.toArray()).map((o) => o.tabla).sort()).toEqual(["documentos_fiscales", "pagos"]);
  });

  it("pago parcial: registra el pago pero todavía no factura; el pago final sí", async () => {
    await sembrar(config());
    const ordenId = await nuevaOrden();
    const m = "M" + seq;
    const p1 = await cobrar({ ordenId, mesaId: m, usuarioId: "U1", monto: 100, formaPago: "efectivo" });
    expect(p1.documentoId).toBeNull();
    expect(await db.documentos_fiscales.count()).toBe(0);
    const p2 = await cobrar({ ordenId, mesaId: m, usuarioId: "U1", monto: 130, formaPago: "tarjeta" });
    expect(p2.documentoId).toBeTruthy();
    expect(await db.documentos_fiscales.count()).toBe(1);
  });

  it("sin CAI vigente NO se acepta ningún pago: no se escribe pago, orden, mesa ni cola", async () => {
    await sembrar(config(), [rango({ siguiente: 101 })]);
    const ordenId = await nuevaOrden();
    const m = "M" + seq;

    await expect(cobrar({ ordenId, mesaId: m, usuarioId: "U1", monto: 230, formaPago: "efectivo" })).rejects.toMatchObject({
      codigo: "rango_agotado",
    });
    expect(await nada()).toEqual({ docs: 0, outbox: 0, pagos: 0 });
    expect((await db.ordenes.get(ordenId))?.estado).toBe("enviada");
    expect((await db.mesas.get(m))?.estado).toBe("ocupada");
  });

  it("si la emisión falla por datos del cliente, el cobro completo se revierte (todo o nada)", async () => {
    await sembrar(config());
    const ordenId = await nuevaOrden();
    const m = "M" + seq;

    await expect(
      cobrar({ ordenId, mesaId: m, usuarioId: "U1", monto: 230, formaPago: "efectivo", cliente: { nombre: "X", rtn: "123" } })
    ).rejects.toMatchObject({ codigo: "cliente_invalido" });

    expect(await nada()).toEqual({ docs: 0, outbox: 0, pagos: 0 });
    expect((await db.ordenes.get(ordenId))?.estado).toBe("enviada");
    expect((await db.rangos_cai.get("R1"))?.siguiente).toBe(1); // no se consumió el número
  });

  it("negocio sin facturación activa: cobra como antes y no emite nada", async () => {
    await sembrar(config({ activa: false }), []);
    const ordenId = await nuevaOrden();
    const r = await cobrar({ ordenId, mesaId: "M" + seq, usuarioId: "U1", monto: 230, formaPago: "efectivo" });
    expect(r.documentoId).toBeNull();
    expect((await db.ordenes.get(ordenId))?.estado).toBe("pagada");
    expect((await db.outbox.toArray()).map((o) => o.tabla)).toEqual(["pagos"]);
  });

  it("ítems creados antes de la facturación (sin tasa) se toman como 15%", async () => {
    await sembrar(config());
    const ordenId = await nuevaOrden([{ nombre_producto: "Viejo", cantidad: 1, precio_unitario: 115, tasa_isv: undefined }]);
    const { documentoId } = await cobrar({ ordenId, mesaId: "M" + seq, usuarioId: "U1", monto: 115, formaPago: "efectivo" });
    expect(await db.documentos_fiscales.get(documentoId!)).toMatchObject({ gravado_15: 100, isv_15: 15 });
  });

  it("dos cobros simultáneos de órdenes distintas obtienen números distintos", async () => {
    await sembrar(config());
    const o1 = await nuevaOrden();
    const m1 = "M" + seq;
    const o2 = await nuevaOrden();
    const m2 = "M" + seq;
    const [a, b] = await Promise.all([
      cobrar({ ordenId: o1, mesaId: m1, usuarioId: "U1", monto: 230, formaPago: "efectivo" }),
      cobrar({ ordenId: o2, mesaId: m2, usuarioId: "U1", monto: 230, formaPago: "efectivo" }),
    ]);
    const nums = [(await db.documentos_fiscales.get(a.documentoId!))!.correlativo, (await db.documentos_fiscales.get(b.documentoId!))!.correlativo];
    expect(nums.sort()).toEqual([1, 2]);
  });
});
