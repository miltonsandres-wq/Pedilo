import "fake-indexeddb/auto";
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { crearBaseConMigraciones } from "../sql/harness";
import { servidor } from "../fiscal/servidorFalso";

vi.mock("@/lib/supabase/client", async () => {
  const m = await import("../fiscal/servidorFalso");
  return { createClient: m.crearClienteFalso };
});

import { db, CLAVE_DELIVERY_CONFIG, type RangoCaiLocal } from "@/lib/offline/db";
import { CLAVE_CONFIG_FISCAL, type ConfigFiscalLocal } from "@/lib/fiscal/emision";
import { FiscalError } from "@/lib/fiscal/rangos";
import { servicioImpresion } from "@/lib/printing/enviarComanda";
import { construirComprobanteEntrega, NOTA_NO_FISCAL, type DatosComprobanteEntrega } from "@/lib/printing/comprobanteEntrega";
import type { Instruccion } from "@/lib/printing/types";
import {
  cancelarPedido, despacharPedido, facturarPedidoDelivery, imprimirComprobanteEntrega, lineasFacturaDelivery,
  sugerirRepartidor, pedidosActivosDe,
} from "@/lib/delivery/pos";

const T = "30000000-0000-0000-0000-000000000001";
const S = "30000000-0000-0000-0000-000000000002";
const CAJERO = "30000000-0000-0000-0000-000000000003";
const PROD = "30000000-0000-0000-0000-000000000004";
const ZONA = "30000000-0000-0000-0000-000000000005";
const R1 = "30000000-0000-0000-0000-000000000006";
const R2 = "30000000-0000-0000-0000-000000000007";
const CAI = "A1B2C3-D4E5F6-A1B2C3-D4E5F6-A1B2C3-D4";
const CAI_NC = "112233-445566-778899-AABBCC-DDEEFF-01";

let pg: PGlite;

const EMISOR = {
  razon_social: "Fondita Doña Ana S.A.", nombre_comercial: "Fondita Doña Ana", rtn: "08019999123456",
  direccion_fiscal: "Col. Palmira, Tegucigalpa", telefono: "2222-3333", correo: null, logo_url: null,
};
const configFiscal = (over: Partial<ConfigFiscalLocal> = {}): ConfigFiscalLocal => ({
  activa: true, tenantId: T, emisor: EMISOR,
  dispositivo: { id: "D1", nombre: "Caja 1", sucursal_id: S, establecimiento: "001", punto_emision: "007" }, ...over,
});
const rango = (over: Partial<RangoCaiLocal> = {}): RangoCaiLocal => ({
  id: "R1", tenant_id: T, sucursal_id: S, establecimiento: "001", punto_emision: "007", tipo_doc: "01", clase: "factura",
  cai: CAI, desde: 1, hasta: 100, siguiente: 1, fecha_limite: "2099-12-31", estado: "activo", dispositivo_id: "D1", ...over,
});
const rangoNota = () => rango({ id: "RN", tipo_doc: "03", clase: "nota_credito", cai: CAI_NC, siguiente: 1 });

const impresiones: Instruccion[][] = [];

/** Crea un pedido en el servidor (como lo haría el menú público) y lo copia al dispositivo, ya en cocina. */
async function pedidoEnCocina(extra: Record<string, unknown> = {}, tarifa = 30) {
  await pg.query("update public.delivery_zonas set tarifa = $1 where id = $2", [tarifa, ZONA]);
  const r = (await pg.query<{ r: { orden_id: string } }>(
    "select public.crear_pedido_delivery($1, 'delivery_web', $2::jsonb) r",
    [S, JSON.stringify({
      nombre: "Ana López", telefono: "99887766", zona_id: ZONA, direccion_referencia: "Portón negro, frente a la pulpería",
      metodo_pago: "efectivo", paga_con: 500, items: [{ producto_id: PROD, cantidad: 2 }], ...extra,
    })]
  )).rows[0].r;
  const id = r.orden_id;
  await pg.exec(`update public.ordenes_delivery set estado_delivery='aceptado' where orden_id='${id}';
                 update public.ordenes_delivery set estado_delivery='en_cocina' where orden_id='${id}'`);
  await copiarAlDispositivo(id);
  return id;
}

async function copiarAlDispositivo(id: string) {
  const ord = (await pg.query("select * from public.ordenes where id=$1", [id])).rows[0] as never;
  await db.ordenes.put({ ...(ord as object), total: Number((ord as { total: number }).total) } as never);
  await db.orden_items.bulkPut((await pg.query("select * from public.orden_items where orden_id=$1", [id])).rows as never);
  await db.delivery_pedidos.put((await pg.query("select * from public.ordenes_delivery where orden_id=$1", [id])).rows[0] as never);
}

const estadoServidor = async (id: string) =>
  (await pg.query<{ estado_delivery: string; repartidor_id: string | null }>(
    "select estado_delivery, repartidor_id from public.ordenes_delivery where orden_id=$1", [id])).rows[0];

beforeAll(async () => {
  vi.stubGlobal("navigator", { onLine: true, storage: { persist: async () => true } });
  pg = await crearBaseConMigraciones();
  servidor.pg = pg;
  servidor.userId = CAJERO;
  const todos = JSON.stringify(Object.fromEntries(["dom", "lun", "mar", "mie", "jue", "vie", "sab"].map((d) => [d, [{ desde: "00:00", hasta: "23:59" }]])));
  await pg.exec(`
    insert into public.tenants (id, nombre) values ('${T}','Negocio');
    insert into public.sucursales (id, tenant_id, nombre) values ('${S}','${T}','Centro');
    insert into auth.users (id) values ('${CAJERO}');
    insert into public.usuarios (id, tenant_id, sucursal_id, rol, nombre) values ('${CAJERO}','${T}','${S}','cajero','Cajero');
    insert into public.productos (id, tenant_id, nombre, precio) values ('${PROD}','${T}','Tacos',115);
    insert into public.producto_sucursales (producto_id, sucursal_id) values ('${PROD}','${S}');
    insert into public.delivery_config (sucursal_id, activo, horario, slug) values ('${S}', true, '${todos}'::jsonb, 'fondita');
    insert into public.delivery_zonas (id, sucursal_id, nombre, tarifa) values ('${ZONA}','${S}','Col. Trejo',30);
    insert into public.repartidores (id, sucursal_id, nombre) values ('${R1}','${S}','Luis'), ('${R2}','${S}','Pedro');
  `);
});

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  impresiones.length = 0;
  vi.spyOn(servicioImpresion, "enviarImpresion").mockImplementation(async (p) => {
    impresiones.push(p.instrucciones);
    return { ok: true };
  });
  vi.spyOn(servicioImpresion, "enviarComanda").mockResolvedValue({ ok: true });
  await db.config.put({ clave: "sucursal", valor: { id: S, nombre: "Centro", agenteImpresionUrl: "http://agente.local" } });
  await db.config.put({ clave: CLAVE_DELIVERY_CONFIG, valor: { tasa_isv_envio: "15", pausado: false } });
  await db.config.put({ clave: CLAVE_CONFIG_FISCAL, valor: configFiscal() });
  await db.rangos_cai.bulkPut([rango(), rangoNota()]);
  await db.repartidores.bulkPut([
    { id: R1, tenant_id: T, sucursal_id: S, nombre: "Luis", telefono: null, activo: true, tipo_pago: "por_entrega", monto_por_entrega: 0, aceptacion_ubicacion_at: null, turno_inicio: null, created_at: "" },
    { id: R2, tenant_id: T, sucursal_id: S, nombre: "Pedro", telefono: null, activo: true, tipo_pago: "fijo", monto_por_entrega: 0, aceptacion_ubicacion_at: null, turno_inicio: null, created_at: "" },
  ]);
});

describe("sugerir repartidor", () => {
  const reps = [
    { id: "a", nombre: "Ana", activo: true }, { id: "b", nombre: "Beto", activo: true }, { id: "c", nombre: "Carlos", activo: false },
  ];
  const ped = (repartidor_id: string, estado_delivery: string) => ({ repartidor_id, estado_delivery });

  it("el que tiene menos pedidos activos (listo o en camino); ignora inactivos y finalizados", () => {
    expect(sugerirRepartidor(reps, [ped("a", "en_camino"), ped("a", "listo"), ped("b", "en_camino")])).toBe("b");
    expect(sugerirRepartidor(reps, [ped("a", "entregado"), ped("b", "en_camino")])).toBe("a");
    expect(sugerirRepartidor(reps, [ped("c", "en_camino")])).toBe("a"); // empate: por nombre
    expect(sugerirRepartidor([{ id: "c", nombre: "C", activo: false }], [])).toBeNull();
    expect(pedidosActivosDe("a", [ped("a", "en_cocina")])).toBe(0);
  });
});

describe("factura de un pedido de delivery", () => {
  it("usa el punto de emisión de ESTA caja, incluye el envío como línea y el total cuadra", async () => {
    const id = await pedidoEnCocina();
    const doc = (await facturarPedidoDelivery({ ordenId: id, usuarioId: CAJERO }))!;
    expect(doc.numero_completo).toBe("001-007-01-00000001");
    expect(doc.cliente_nombre).toBe("Consumidor Final");
    expect((doc.lineas as { nombre: string }[]).map((l) => l.nombre)).toEqual(["Tacos", "Servicio de envío a domicilio"]);
    expect(doc.total).toBe(260); // 2 × 115 + 30
    expect(doc.total).toBe(doc.gravado_15 + doc.isv_15);
  });

  it("con RTN: sale a nombre y RTN que pidió el cliente", async () => {
    const id = await pedidoEnCocina({ tipo_factura: "con_rtn", factura_nombre: "Empresa SA", factura_rtn: "08011999123456" });
    const doc = (await facturarPedidoDelivery({ ordenId: id, usuarioId: CAJERO }))!;
    expect(doc).toMatchObject({ cliente_nombre: "Empresa SA", cliente_rtn: "08011999123456" });
  });

  it("la tasa de ISV del envío es configurable (exento)", async () => {
    await db.config.put({ clave: CLAVE_DELIVERY_CONFIG, valor: { tasa_isv_envio: "exento" } });
    const id = await pedidoEnCocina();
    const doc = (await facturarPedidoDelivery({ ordenId: id, usuarioId: CAJERO }))!;
    expect(doc.importe_exento).toBe(30);
    expect(doc.gravado_15).toBeCloseTo(200, 2); // 230 con ISV incluido
  });

  it("sin envío no agrega la línea", () => {
    expect(lineasFacturaDelivery([], 0, "15")).toEqual([]);
  });

  it("reintentar no emite una segunda factura ni avanza el correlativo", async () => {
    const id = await pedidoEnCocina();
    const a = (await facturarPedidoDelivery({ ordenId: id, usuarioId: CAJERO }))!;
    const b = (await facturarPedidoDelivery({ ordenId: id, usuarioId: CAJERO }))!;
    expect(b.id).toBe(a.id);
    expect(await db.documentos_fiscales.count()).toBe(1);
    expect((await db.rangos_cai.get("R1"))!.siguiente).toBe(2);
  });

  it("respeta los bloqueos del módulo CAI: sin rango vigente no se emite nada", async () => {
    await db.rangos_cai.update("R1", { siguiente: 101, estado: "agotado" });
    const id = await pedidoEnCocina();
    await expect(facturarPedidoDelivery({ ordenId: id, usuarioId: CAJERO })).rejects.toBeInstanceOf(FiscalError);
    expect(await db.documentos_fiscales.count()).toBe(0);
  });

  it("caja sin vincular a un punto de emisión: bloquea", async () => {
    await db.config.put({ clave: CLAVE_CONFIG_FISCAL, valor: configFiscal({ dispositivo: null as never }) });
    const id = await pedidoEnCocina();
    await expect(facturarPedidoDelivery({ ordenId: id, usuarioId: CAJERO })).rejects.toThrow(/no está vinculada/);
  });

  it("negocio sin facturación fiscal: no emite", async () => {
    await db.config.put({ clave: CLAVE_CONFIG_FISCAL, valor: configFiscal({ activa: false }) });
    const id = await pedidoEnCocina();
    expect(await facturarPedidoDelivery({ ordenId: id, usuarioId: CAJERO })).toBeNull();
    expect(await db.documentos_fiscales.count()).toBe(0);
  });
});

describe("comprobante de entrega", () => {
  const base: DatosComprobanteEntrega = {
    restaurante: "Fondita Doña Ana", numeroPedido: 12, fechaHora: new Date("2030-06-15T18:30:00Z"), cliente: "Ana López",
    telefono: "99887766", zona: "Col. Trejo", referencia: "Portón negro, frente a la pulpería",
    items: [{ cantidad: 2, nombre: "Tacos de carne asada con todo" }], subtotal: 230, envio: 30, total: 260,
    metodoPagoEtiqueta: "Efectivo", pagaCon: 500, facturaNumero: "001-007-01-00000042",
  };
  const textos = (i: Instruccion[]) => i.flatMap((x) => (x.op === "texto" ? [x] : []));

  it("trae lo que necesita el repartidor, con la referencia en letra grande y el pie no fiscal en negrita", () => {
    const t = textos(construirComprobanteEntrega(base));
    const plano = t.map((x) => x.texto).join("\n");
    for (const esperado of ["Fondita Doña Ana", "#12", "Ana López", "99887766", "Col. Trejo", "2 x Tacos", "L 260.00", "Efectivo", "Paga con: L 500.00  /  Cambio: L 240.00", "001-007-01-00000042"]) {
      expect(plano).toContain(esperado);
    }
    expect(t.filter((x) => x.size === "doble" && x.texto.includes("Portón")).length).toBeGreaterThan(0);
    const pie = t[t.length - 1];
    expect(pie).toMatchObject({ texto: NOTA_NO_FISCAL, bold: true });
    expect(plano).not.toMatch(/CAI|Rango autorizado/);
  });

  it("sin factura o sin 'paga con' lo dice claro; con tarjeta no muestra cambio", () => {
    const plano = textos(construirComprobanteEntrega({ ...base, facturaNumero: null, pagaCon: null, metodoPagoEtiqueta: "Tarjeta contra entrega" })).map((x) => x.texto).join("\n");
    expect(plano).toContain("Sin factura");
    expect(plano).not.toContain("Paga con");
  });

  it("las líneas largas caben en 48 columnas", () => {
    for (const x of textos(construirComprobanteEntrega({ ...base, referencia: "x".repeat(200), cliente: "y".repeat(120) }))) {
      expect(x.texto.length).toBeLessThanOrEqual(x.size === "doble" ? 24 : 48);
    }
  });

  it("imprimirlo NO consume correlativo ni crea documentos fiscales", async () => {
    const id = await pedidoEnCocina();
    const antes = { siguiente: (await db.rangos_cai.get("R1"))!.siguiente, notas: (await db.rangos_cai.get("RN"))!.siguiente };
    const r = await imprimirComprobanteEntrega(id);
    expect(r.ok).toBe(true);
    expect(impresiones).toHaveLength(1);
    expect((await db.rangos_cai.get("R1"))!.siguiente).toBe(antes.siguiente);
    expect((await db.rangos_cai.get("RN"))!.siguiente).toBe(antes.notas);
    expect(await db.documentos_fiscales.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });
});

describe("despachar (Listo): factura + estado + repartidor + impresiones", () => {
  it("emite la factura, pasa a listo con el repartidor y manda a imprimir factura y comprobante", async () => {
    const id = await pedidoEnCocina();
    const r = await despacharPedido({ ordenId: id, repartidorId: R1, usuarioId: CAJERO });

    expect(r.documentoId).toBeTruthy();
    expect(await estadoServidor(id)).toEqual({ estado_delivery: "listo", repartidor_id: R1 });
    expect(impresiones).toHaveLength(2); // factura + comprobante
    const comprobante = impresiones[1].flatMap((x) => (x.op === "texto" ? [x.texto] : [])).join("\n");
    expect(comprobante).toContain((await db.documentos_fiscales.get(r.documentoId!))!.numero_completo);
    expect(comprobante).toContain("Luis");
    expect((await db.rangos_cai.get("R1"))!.siguiente).toBe(2); // solo la factura consumió número
  });

  it("si el CAI está bloqueado no cambia el estado ni asigna repartidor", async () => {
    await db.rangos_cai.update("R1", { estado: "vencido" });
    const id = await pedidoEnCocina();
    await expect(despacharPedido({ ordenId: id, repartidorId: R1, usuarioId: CAJERO })).rejects.toBeInstanceOf(FiscalError);
    expect(await estadoServidor(id)).toEqual({ estado_delivery: "en_cocina", repartidor_id: null });
    expect(impresiones).toHaveLength(0);
  });

  it("no despacha un pedido que no está en cocina ni con un repartidor inactivo", async () => {
    const id = await pedidoEnCocina();
    await db.delivery_pedidos.update(id, { estado_delivery: "recibido" });
    await expect(despacharPedido({ ordenId: id, repartidorId: R1, usuarioId: CAJERO })).rejects.toThrow(/en cocina/);
    await db.delivery_pedidos.update(id, { estado_delivery: "en_cocina" });
    await db.repartidores.update(R1, { activo: false });
    await expect(despacharPedido({ ordenId: id, repartidorId: R1, usuarioId: CAJERO })).rejects.toThrow(/repartidor activo/);
  });

  it("reintentar tras un fallo no emite otra factura", async () => {
    const id = await pedidoEnCocina();
    await despacharPedido({ ordenId: id, repartidorId: R1, usuarioId: CAJERO });
    const otra = await despacharPedido({ ordenId: id, repartidorId: R2, usuarioId: CAJERO });
    expect(await db.documentos_fiscales.count()).toBe(1);
    expect(otra.documentoId).toBeTruthy();
    expect((await estadoServidor(id)).repartidor_id).toBe(R2); // se puede reasignar mientras no salga
  });
});

describe("cancelar después de facturar", () => {
  it("emite nota de crédito (la factura NO se borra) y cancela el pedido", async () => {
    const id = await pedidoEnCocina();
    const { documentoId } = await despacharPedido({ ordenId: id, repartidorId: R1, usuarioId: CAJERO });
    const r = await cancelarPedido({ ordenId: id, motivo: "El cliente ya no lo quiere", usuarioId: CAJERO });

    expect(r.notaCreditoId).toBeTruthy();
    const docs = await db.documentos_fiscales.toArray();
    expect(docs.map((d) => d.clase).sort()).toEqual(["factura", "nota_credito"]);
    expect(docs.find((d) => d.id === documentoId)!.estado).toBe("emitida");
    expect((await estadoServidor(id)).estado_delivery).toBe("cancelado");
  });

  it("sin factura se cancela directo; sin motivo no se puede", async () => {
    const id = await pedidoEnCocina();
    await expect(cancelarPedido({ ordenId: id, motivo: "  ", usuarioId: CAJERO })).rejects.toThrow(/motivo/);
    expect((await cancelarPedido({ ordenId: id, motivo: "Se acabó el insumo", usuarioId: CAJERO })).notaCreditoId).toBeNull();
    expect((await estadoServidor(id)).estado_delivery).toBe("cancelado");
  });

  it("si la nota de crédito no se puede emitir, el pedido NO se cancela", async () => {
    const id = await pedidoEnCocina();
    await despacharPedido({ ordenId: id, repartidorId: R1, usuarioId: CAJERO });
    await db.rangos_cai.update("RN", { estado: "vencido" });
    await expect(cancelarPedido({ ordenId: id, motivo: "x", usuarioId: CAJERO })).rejects.toBeInstanceOf(FiscalError);
    expect((await estadoServidor(id)).estado_delivery).toBe("listo");
  });
});
