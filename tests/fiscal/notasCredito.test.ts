import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { db, type RangoCaiLocal } from "@/lib/offline/db";
import { CLAVE_CONFIG_FISCAL, emitirDocumentoFiscal, type ConfigFiscalLocal } from "@/lib/fiscal/emision";
import { emitirNotaCredito } from "@/lib/fiscal/notasCredito";
import { imprimirDocumentoFiscal } from "@/lib/fiscal/impresion";
import type { PeticionImpresion } from "@/lib/printing/types";

const CAI_FACT = "A1B2C3-D4E5F6-A1B2C3-D4E5F6-A1B2C3-D4";
const CAI_NC = "112233-445566-778899-AABBCC-DDEEFF-03";

const config: ConfigFiscalLocal = {
  activa: true, tenantId: "T1", logoUrl: null,
  emisor: { razon_social: "Rosa S.A.", nombre_comercial: "Rosa", rtn: "08019999123456", direccion_fiscal: "Col. Palmira", telefono: null, correo: null, logo_url: null },
  dispositivo: { id: "D1", nombre: "Caja 1", sucursal_id: "S1", establecimiento: "001", punto_emision: "001" },
};

const rangoFactura: RangoCaiLocal = {
  id: "RF", tenant_id: "T1", sucursal_id: "S1", establecimiento: "001", punto_emision: "001", tipo_doc: "01", clase: "factura",
  cai: CAI_FACT, desde: 1, hasta: 100, siguiente: 1, fecha_limite: "2099-12-31", estado: "activo", dispositivo_id: "D1",
};
const rangoNota: RangoCaiLocal = { ...rangoFactura, id: "RN", tipo_doc: "03", clase: "nota_credito", cai: CAI_NC, desde: 1, hasta: 5 };

async function sembrar(rangos: RangoCaiLocal[] = [rangoFactura, rangoNota]) {
  await db.config.put({ clave: CLAVE_CONFIG_FISCAL, valor: config });
  await db.config.put({ clave: "sucursal", valor: { id: "S1", nombre: "Centro", agenteImpresionUrl: "https://agente.example.com/comanda" } });
  await db.rangos_cai.bulkPut(rangos);
}

/** Factura mixta con cliente y exoneración para comprobar que la nota copia TODO. */
async function nuevaFactura(over = {}) {
  return emitirDocumentoFiscal({
    ordenId: crypto.randomUUID(), sucursalId: "S1", usuarioId: "U1",
    lineas: [
      { nombre: "Hamburguesa", cantidad: 2, precioUnitario: 115, tasa: "15" },
      { nombre: "Cerveza", cantidad: 2, precioUnitario: 59, tasa: "18" },
      { nombre: "Ensalada", cantidad: 1, precioUnitario: 50, tasa: "exento" },
    ],
    cliente: { nombre: "Juan Pérez", rtn: "08011999123456" },
    ...over,
  });
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("emitirNotaCredito", () => {
  it("copia exacto los montos, líneas y cliente de la factura, la referencia y usa su propio rango/tipo", async () => {
    await sembrar();
    const factura = await nuevaFactura();
    const nota = await emitirNotaCredito({ facturaId: factura.id, usuarioId: "U9", motivo: "  Producto devuelto  " });

    expect(nota).toMatchObject({
      clase: "nota_credito", tipo_doc: "03", numero_completo: "001-001-03-00000001", cai: CAI_NC, rango_desde: 1, rango_hasta: 5,
      documento_referencia_id: factura.id, orden_id: factura.orden_id, motivo_nota: "Producto devuelto", usuario_id: "U9",
      cliente_nombre: "Juan Pérez", cliente_rtn: "08011999123456",
      importe_exento: 50, gravado_15: 200, isv_15: 30, gravado_18: 100, isv_18: 18, total: 398, total_letras: factura.total_letras,
      estado: "emitida", sync_estado: "pendiente",
    });
    expect(nota.lineas).toEqual(factura.lineas);

    // la numeración de la factura NO se movió y la factura quedó intacta
    expect((await db.rangos_cai.get("RF"))?.siguiente).toBe(2);
    expect((await db.rangos_cai.get("RN"))?.siguiente).toBe(2);
    expect(await db.documentos_fiscales.get(factura.id)).toMatchObject({ estado: "emitida", numero_completo: "001-001-01-00000001" });
    // y ambos documentos van al servidor
    expect((await db.outbox.toArray()).filter((o) => o.tabla === "documentos_fiscales")).toHaveLength(2);
  });

  it("acredita también una factura exonerada con sus datos de exoneración", async () => {
    await sembrar();
    const factura = await nuevaFactura({ exoneracion: { noConstanciaExonerado: "CE-9", noRegistroSag: "SAG-1" } });
    const nota = await emitirNotaCredito({ facturaId: factura.id, usuarioId: "U1", motivo: "Error" });
    expect(nota).toMatchObject({ importe_exonerado: 398, isv_15: 0, no_constancia_exonerado: "CE-9", no_registro_sag: "SAG-1" });
  });

  it("factura a consumidor final -> nota a consumidor final", async () => {
    await sembrar();
    const factura = await nuevaFactura({ cliente: undefined });
    const nota = await emitirNotaCredito({ facturaId: factura.id, usuarioId: "U1", motivo: "Error" });
    expect(nota).toMatchObject({ cliente_nombre: "Consumidor Final", cliente_rtn: null });
  });

  it("exige motivo", async () => {
    await sembrar();
    const factura = await nuevaFactura();
    await expect(emitirNotaCredito({ facturaId: factura.id, usuarioId: "U1", motivo: "   " })).rejects.toMatchObject({ codigo: "motivo_requerido" });
  });

  it("no se puede acreditar dos veces la misma factura, ni con llamadas simultáneas", async () => {
    await sembrar();
    const factura = await nuevaFactura();
    const resultados = await Promise.allSettled([
      emitirNotaCredito({ facturaId: factura.id, usuarioId: "U1", motivo: "A" }),
      emitirNotaCredito({ facturaId: factura.id, usuarioId: "U1", motivo: "B" }),
      emitirNotaCredito({ facturaId: factura.id, usuarioId: "U1", motivo: "C" }),
    ]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of resultados.filter((x) => x.status === "rejected")) {
      expect((r as PromiseRejectedResult).reason).toMatchObject({ codigo: "ya_acreditado" });
    }
    expect((await db.documentos_fiscales.toArray()).filter((d) => d.clase === "nota_credito")).toHaveLength(1);
    expect((await db.rangos_cai.get("RN"))?.siguiente).toBe(2); // solo se consumió un número
  });

  it("sin rango de notas de crédito: bloquea y no escribe nada", async () => {
    await sembrar([rangoFactura]);
    const factura = await nuevaFactura();
    const antes = { docs: await db.documentos_fiscales.count(), cola: await db.outbox.count() };
    await expect(emitirNotaCredito({ facturaId: factura.id, usuarioId: "U1", motivo: "X" })).rejects.toMatchObject({
      codigo: "sin_rango", message: expect.stringContaining("notas de crédito"),
    });
    expect({ docs: await db.documentos_fiscales.count(), cola: await db.outbox.count() }).toEqual(antes);
  });

  it("rango de notas agotado: bloquea", async () => {
    await sembrar([rangoFactura, { ...rangoNota, siguiente: 6 }]);
    const factura = await nuevaFactura();
    await expect(emitirNotaCredito({ facturaId: factura.id, usuarioId: "U1", motivo: "X" })).rejects.toMatchObject({ codigo: "rango_agotado" });
  });

  it("rechaza facturas anuladas, en conflicto, inexistentes o que ya son notas", async () => {
    await sembrar();
    const anulada = await nuevaFactura();
    await db.documentos_fiscales.update(anulada.id, { estado: "anulada" });
    await expect(emitirNotaCredito({ facturaId: anulada.id, usuarioId: "U1", motivo: "X" })).rejects.toMatchObject({ codigo: "factura_invalida" });

    const conflicto = await nuevaFactura();
    await db.documentos_fiscales.update(conflicto.id, { sync_estado: "conflicto" });
    await expect(emitirNotaCredito({ facturaId: conflicto.id, usuarioId: "U1", motivo: "X" })).rejects.toMatchObject({ codigo: "factura_invalida" });

    await expect(emitirNotaCredito({ facturaId: "no-existe", usuarioId: "U1", motivo: "X" })).rejects.toMatchObject({ codigo: "documento_no_encontrado" });

    const ok = await nuevaFactura();
    const nota = await emitirNotaCredito({ facturaId: ok.id, usuarioId: "U1", motivo: "X" });
    await expect(emitirNotaCredito({ facturaId: nota.id, usuarioId: "U1", motivo: "X" })).rejects.toMatchObject({ codigo: "factura_invalida" });
  });

  it("si emitir falla, no queda consumido ningún número (todo o nada)", async () => {
    await sembrar([rangoFactura, { ...rangoNota, fecha_limite: "2020-01-01" }]);
    const factura = await nuevaFactura();
    await expect(emitirNotaCredito({ facturaId: factura.id, usuarioId: "U1", motivo: "X" })).rejects.toMatchObject({ codigo: "rango_vencido" });
    expect((await db.rangos_cai.get("RN"))?.siguiente).toBe(1);
  });
});

describe("impresión de la nota de crédito", () => {
  it("sale como NOTA DE CRÉDITO con la factura de referencia (número, CAI, fecha) y el motivo", async () => {
    await sembrar();
    const enviados: PeticionImpresion[] = [];
    vi.stubGlobal("fetch", async (_u: string, init: { body: string }) => {
      enviados.push(JSON.parse(init.body));
      return { ok: true, status: 200 };
    });
    const factura = await nuevaFactura();
    const nota = await emitirNotaCredito({ facturaId: factura.id, usuarioId: "U1", motivo: "Cliente devolvió la orden" });
    await imprimirDocumentoFiscal(nota.id);

    const t = enviados[0].instrucciones.flatMap((i) => (i.op === "texto" ? [i.texto] : []));
    expect(t).toContain("NOTA DE CRÉDITO");
    expect(t).toContain("No.: 001-001-03-00000001");
    expect(t).toContain("Documento de referencia:");
    expect(t).toContain("No.: " + factura.numero_completo);
    expect(t).toContain(CAI_FACT); // CAI de la factura original
    expect(t).toContain(CAI_NC); // CAI de la nota
    expect(t.some((x) => x.startsWith("Motivo: Cliente devolvió"))).toBe(true);
    expect(t.join("|")).not.toContain("FACTURA");
  });
});
