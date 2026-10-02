import "fake-indexeddb/auto";
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { crearBaseConMigraciones } from "../sql/harness";

vi.mock("@/lib/supabase/client", () => ({
  // el flush del outbox no debe tocar red en estas pruebas
  createClient: () => ({ from: () => ({ insert: async () => ({ error: { message: "Failed to fetch" } }), update: () => ({ eq: async () => ({ error: { message: "Failed to fetch" } }) }) }), rpc: async () => ({ data: null, error: { message: "Failed to fetch" } }) }),
}));

import { db, type RangoCaiLocal } from "@/lib/offline/db";
import { CLAVE_CONFIG_FISCAL, type ConfigFiscalLocal } from "@/lib/fiscal/emision";
import { FiscalError } from "@/lib/fiscal/rangos";
import { cobrar } from "@/lib/pos/acciones";
import { servicioImpresion } from "@/lib/printing/enviarComanda";
import { construirReciboDeliveryExterno, type DatosReciboExterno } from "@/lib/printing/documentoTexto";
import type { Instruccion } from "@/lib/printing/types";
import { imprimirReciboDeliveryExterno } from "@/lib/delivery/reciboExterno";

const CAI = "A1B2C3-D4E5F6-A1B2C3-D4E5F6-A1B2C3-D4";
const config = (): ConfigFiscalLocal => ({
  activa: true, tenantId: "T1",
  emisor: { razon_social: "Taquería María del Carmen S.A.", nombre_comercial: "Tacos María del Carmen", rtn: "08019999123456", direccion_fiscal: "Siguatepeque", telefono: "2222-3333", correo: null, logo_url: null },
  dispositivo: { id: "D1", nombre: "Caja", sucursal_id: "S1", establecimiento: "001", punto_emision: "001" },
});
const rango = (over: Partial<RangoCaiLocal> = {}): RangoCaiLocal => ({
  id: "R1", tenant_id: "T1", sucursal_id: "S1", establecimiento: "001", punto_emision: "001", tipo_doc: "01", clase: "factura",
  cai: CAI, desde: 1, hasta: 100, siguiente: 1, fecha_limite: "2099-12-31", estado: "activo", dispositivo_id: "D1", ...over,
});

let seq = 0;
async function nuevaOrden() {
  seq++;
  const id = `O${seq}`;
  await db.ordenes.add({
    id, sucursal_id: "S1", mesa_id: `M${seq}`, usuario_id: "U1", estado: "enviada", total: 330, cliente_nombre: null, personas: null,
    numero_dia: 12, lista_cocina: false, created_at: new Date().toISOString(), enviada_at: null, pagada_at: null, cancelada_at: null, motivo_cancelacion: null,
  });
  await db.mesas.add({ id: `M${seq}`, sucursal_id: "S1", nombre: `Mesa ${seq}`, capacidad: 4, zona: null, pos_x: null, pos_y: null, estado: "ocupada", activa: true });
  const base = { orden_id: id, producto_id: "P", nota: null, impreso: true, origen_cliente: false, created_at: new Date().toISOString(), tasa_isv: "15" };
  await db.orden_items.bulkAdd([
    { ...base, id: `${id}-1`, nombre_producto: "Tacos de carne asada", cantidad: 2, precio_unitario: 90 },
    { ...base, id: `${id}-2`, nombre_producto: "Limonada", cantidad: 3, precio_unitario: 50 },
  ]);
  return { id, mesa: `M${seq}` };
}

const cobroExterno = (o: { id: string; mesa: string }) =>
  cobrar({ ordenId: o.id, mesaId: o.mesa, usuarioId: "U1", monto: 330, formaPago: "delivery_externo", referencia: "PedidosYa #8841" });

const impresiones: Instruccion[][] = [];
const textos = (i: Instruccion[]) => i.flatMap((x) => (x.op === "texto" ? [x.texto] : [])).join("\n");

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  impresiones.length = 0;
  vi.spyOn(servicioImpresion, "enviarImpresion").mockImplementation(async (p) => {
    impresiones.push(p.instrucciones);
    return { ok: true };
  });
  await db.config.put({ clave: CLAVE_CONFIG_FISCAL, valor: config() });
  await db.config.put({ clave: "sucursal", valor: { id: "S1", nombre: "Centro", agenteImpresionUrl: "http://agente.local" } });
  await db.rangos_cai.put(rango());
});

describe("cobro con delivery externo (sin factura CAI)", () => {
  it("cobra y cierra la orden SIN emitir factura ni consumir correlativo, aunque el negocio facture", async () => {
    const o = await nuevaOrden();
    const r = await cobroExterno(o);
    expect(r.documentoId).toBeNull();
    expect(await db.documentos_fiscales.count()).toBe(0);
    expect((await db.rangos_cai.get("R1"))!.siguiente).toBe(1);
    expect((await db.ordenes.get(o.id))!.estado).toBe("pagada");
    expect((await db.mesas.get(o.mesa))!.estado).toBe("libre");
    const pagos = await db.pagos.toArray();
    expect(pagos).toHaveLength(1);
    expect(pagos[0]).toMatchObject({ forma_pago: "delivery_externo", monto: 330, referencia: "PedidosYa #8841" });
  });

  it("no depende del CAI: con el rango agotado o vencido igual se puede cobrar", async () => {
    await db.rangos_cai.update("R1", { siguiente: 101, estado: "agotado" });
    const o = await nuevaOrden();
    await expect(cobroExterno(o)).resolves.toMatchObject({ documentoId: null });
    expect((await db.ordenes.get(o.id))!.estado).toBe("pagada");
  });

  it("en cambio, con efectivo y CAI agotado el cobro SÍ se bloquea (no cambió el comportamiento normal)", async () => {
    await db.rangos_cai.update("R1", { siguiente: 101, estado: "agotado" });
    const o = await nuevaOrden();
    await expect(cobrar({ ordenId: o.id, mesaId: o.mesa, usuarioId: "U1", monto: 330, formaPago: "efectivo" })).rejects.toBeInstanceOf(FiscalError);
    expect(await db.pagos.count()).toBe(0);
  });

  it("con efectivo sigue facturando como siempre", async () => {
    const o = await nuevaOrden();
    const r = await cobrar({ ordenId: o.id, mesaId: o.mesa, usuarioId: "U1", monto: 330, formaPago: "efectivo" });
    expect(r.documentoId).toBeTruthy();
    expect(await db.documentos_fiscales.count()).toBe(1);
  });
});

describe("recibo de delivery externo", () => {
  const datos: DatosReciboExterno = {
    restaurante: "Tacos María del Carmen", telefono: "2222-3333", numeroDia: 12, fecha: new Date("2030-06-15T18:30:00Z"),
    referencia: "PedidosYa #8841",
    lineas: [{ nombre: "Tacos de carne asada", cantidad: 2, precio_unitario: 90, total: 180 }, { nombre: "Limonada", cantidad: 3, precio_unitario: 50, total: 150 }],
    subtotal: 330,
  };

  it("lleva el nombre del restaurante, el detalle del pedido y el subtotal", () => {
    const t = textos(construirReciboDeliveryExterno(datos));
    for (const esperado of ["Tacos María del Carmen", "RECIBO", "Delivery externo", "#12", "PedidosYa #8841", "Tacos de carne asada", "Limonada", "180.00", "150.00", "SUBTOTAL L.", "330.00"]) {
      expect(t).toContain(esperado);
    }
  });

  it("NO es factura: sin CAI, sin rango autorizado y con la leyenda de no fiscal", () => {
    const t = textos(construirReciboDeliveryExterno(datos));
    expect(t).not.toMatch(/CAI|Rango autorizado|FACTURA|RTN/);
    expect(t).toContain("NO ES DOCUMENTO FISCAL");
  });

  it("sin empresa/pedido no imprime esa línea", () => {
    expect(textos(construirReciboDeliveryExterno({ ...datos, referencia: "  " }))).not.toContain("Empresa / pedido");
  });

  it("imprimirlo manda el recibo con los datos reales de la orden y no consume correlativo", async () => {
    const o = await nuevaOrden();
    const r = await imprimirReciboDeliveryExterno(o.id, "Hugo #55");
    expect(r.ok).toBe(true);
    const t = textos(impresiones[0]);
    expect(t).toContain("Tacos María del Carmen"); // nombre comercial del emisor
    expect(t).toContain("Hugo #55");
    expect(t).toContain("330.00");
    expect((await db.rangos_cai.get("R1"))!.siguiente).toBe(1);
    expect(await db.documentos_fiscales.count()).toBe(0);
  });

  it("sin agente de impresión avisa claro; sin productos también", async () => {
    await db.config.put({ clave: "sucursal", valor: { id: "S1", nombre: "Centro", agenteImpresionUrl: null } });
    const o = await nuevaOrden();
    expect(await imprimirReciboDeliveryExterno(o.id)).toMatchObject({ ok: false, error: expect.stringMatching(/agente de impresión/) });
    await db.config.put({ clave: "sucursal", valor: { id: "S1", nombre: "Centro", agenteImpresionUrl: "http://x" } });
    await db.orden_items.where("orden_id").equals(o.id).delete();
    expect(await imprimirReciboDeliveryExterno(o.id)).toMatchObject({ ok: false, error: expect.stringMatching(/no tiene productos/) });
  });
});

describe("base de datos: la forma de pago nueva", () => {
  let pg: PGlite;
  beforeAll(async () => {
    pg = await crearBaseConMigraciones();
    await pg.exec(`
      insert into public.tenants (id, nombre) values ('a0000000-0000-0000-0000-000000000001','N');
      insert into public.sucursales (id, tenant_id, nombre) values ('a0000000-0000-0000-0000-0000000000a1','a0000000-0000-0000-0000-000000000001','S');
      insert into public.mesas (id, tenant_id, sucursal_id, nombre) values ('a0000000-0000-0000-0000-0000000000b1','a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-0000000000a1','M1');
      insert into public.ordenes (id, tenant_id, sucursal_id, mesa_id, estado, total) values ('a0000000-0000-0000-0000-0000000000c1','a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-0000000000a1','a0000000-0000-0000-0000-0000000000b1','enviada',330);
    `);
  });

  it("pagos y formas de pago por sucursal aceptan delivery_externo; siguen rechazando inventos", async () => {
    await pg.exec("insert into public.formas_pago_sucursal (sucursal_id, forma_pago) values ('a0000000-0000-0000-0000-0000000000a1','delivery_externo')");
    await pg.exec("insert into public.pagos (orden_id, monto, forma_pago) values ('a0000000-0000-0000-0000-0000000000c1', 330, 'delivery_externo')");
    expect((await pg.query<{ estado: string }>("select estado from public.ordenes where id='a0000000-0000-0000-0000-0000000000c1'")).rows[0].estado).toBe("pagada");
    await expect(pg.exec("insert into public.pagos (orden_id, monto, forma_pago) values ('a0000000-0000-0000-0000-0000000000c1', 1, 'bitcoin')")).rejects.toThrow();
  });
});
