import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { db, type RangoCaiLocal } from "@/lib/offline/db";
import { CLAVE_CONFIG_FISCAL, emitirDocumentoFiscal, type ConfigFiscalLocal } from "@/lib/fiscal/emision";
import { imprimirDocumentoFiscal, imprimirPrecuenta } from "@/lib/fiscal/impresion";
import { urlEndpointAgente } from "@/lib/printing/enviarComanda";
import type { PeticionImpresion } from "@/lib/printing/types";

const AGENTE = "https://cocina-fondita.tunnel.example.com/comanda";

const config: ConfigFiscalLocal = {
  activa: true, tenantId: "T1", logoUrl: null,
  emisor: {
    razon_social: "Inversiones Rosa", nombre_comercial: "Taquería Rosa", rtn: "08019999123456",
    direccion_fiscal: "Col. Palmira", telefono: "2222-3333", correo: null, logo_url: null,
  },
  dispositivo: { id: "D1", nombre: "Caja 1", sucursal_id: "S1", establecimiento: "001", punto_emision: "001" },
};

const rango: RangoCaiLocal = {
  id: "R1", tenant_id: "T1", sucursal_id: "S1", establecimiento: "001", punto_emision: "001", tipo_doc: "01",
  clase: "factura", cai: "A1B2C3-D4E5F6-A1B2C3-D4E5F6-A1B2C3-D4", desde: 1, hasta: 100, siguiente: 1,
  fecha_limite: "2099-12-31", estado: "activo", dispositivo_id: "D1",
};

let enviados: { url: string; body: PeticionImpresion }[] = [];
let fetchFalla = false;

const textos = (p: PeticionImpresion) => p.instrucciones.flatMap((i) => (i.op === "texto" ? [i.texto] : []));

async function nuevoDocumento() {
  return emitirDocumentoFiscal({
    ordenId: crypto.randomUUID(), sucursalId: "S1", usuarioId: "U1",
    lineas: [{ nombre: "Tacos", cantidad: 2, precioUnitario: 115, tasa: "15" }],
  });
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await db.config.put({ clave: CLAVE_CONFIG_FISCAL, valor: config });
  await db.config.put({ clave: "sucursal", valor: { id: "S1", nombre: "Sucursal Centro", agenteImpresionUrl: AGENTE } });
  await db.rangos_cai.put(rango);
  enviados = [];
  fetchFalla = false;
  vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
    if (fetchFalla) throw new Error("connect ECONNREFUSED");
    enviados.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200 };
  });
});

describe("urlEndpointAgente", () => {
  it("deriva los endpoints de la URL guardada (que termina en /comanda)", () => {
    expect(urlEndpointAgente(AGENTE, "imprimir")).toBe("https://cocina-fondita.tunnel.example.com/imprimir");
    expect(urlEndpointAgente("https://x.example.com/", "imprimir")).toBe("https://x.example.com/imprimir");
    expect(urlEndpointAgente("https://x.example.com/comanda/", "imprimir")).toBe("https://x.example.com/imprimir");
    expect(urlEndpointAgente(" https://x.example.com ", "imprimir")).toBe("https://x.example.com/imprimir");
  });
});

describe("imprimirDocumentoFiscal", () => {
  it("la primera impresión es el original: sin marca de reimpresión, con logo, y queda registrada", async () => {
    await db.config.put({ clave: "logo_impresion", valor: { url: "https://x/logo.png", png: "UE5HREFUQQ==" } });
    const doc = await nuevoDocumento();

    const r = await imprimirDocumentoFiscal(doc.id);
    expect(r.ok).toBe(true);
    expect(enviados).toHaveLength(1);
    expect(enviados[0].url).toBe("https://cocina-fondita.tunnel.example.com/imprimir");
    expect(enviados[0].body.logoPngBase64).toBe("UE5HREFUQQ==");
    const t = textos(enviados[0].body);
    expect(t).toContain("Original: Cliente");
    expect(t).toContain("No.: 001-001-01-00000001");
    expect(t.join("|")).not.toContain("REIMPRESIÓN");
    expect((await db.documentos_fiscales.get(doc.id))?.impreso_at).toBeTruthy();
  });

  it("la reimpresión sale marcada y NO consume correlativo ni crea documentos ni encola nada", async () => {
    const doc = await nuevoDocumento();
    await imprimirDocumentoFiscal(doc.id);

    const antes = {
      siguiente: (await db.rangos_cai.get("R1"))!.siguiente,
      docs: await db.documentos_fiscales.count(),
      cola: await db.outbox.count(),
    };
    await imprimirDocumentoFiscal(doc.id);
    await imprimirDocumentoFiscal(doc.id);

    expect(textos(enviados[1].body)).toContain("*** REIMPRESIÓN ***");
    expect(textos(enviados[2].body)).toContain("*** REIMPRESIÓN ***");
    expect(textos(enviados[1].body)).toContain("No.: 001-001-01-00000001"); // el MISMO número
    expect({
      siguiente: (await db.rangos_cai.get("R1"))!.siguiente,
      docs: await db.documentos_fiscales.count(),
      cola: await db.outbox.count(),
    }).toEqual(antes);
  });

  it("si la primera impresión falla (agente apagado), reintentar sigue siendo el original", async () => {
    const doc = await nuevoDocumento();
    fetchFalla = true;
    const r1 = await imprimirDocumentoFiscal(doc.id);
    expect(r1.ok).toBe(false);
    expect(r1.error).toMatch(/ECONNREFUSED/);
    expect((await db.documentos_fiscales.get(doc.id))?.impreso_at).toBeFalsy();

    fetchFalla = false;
    await imprimirDocumentoFiscal(doc.id);
    expect(textos(enviados[0].body).join("|")).not.toContain("REIMPRESIÓN");
  });

  it("la copia para el emisor dice 'Copia: Emisor' y no cuenta como original ni como reimpresión", async () => {
    const doc = await nuevoDocumento();
    await imprimirDocumentoFiscal(doc.id, { copia: "emisor" });
    expect(textos(enviados[0].body)).toContain("Copia: Emisor");
    expect(textos(enviados[0].body).join("|")).not.toContain("REIMPRESIÓN");
    expect((await db.documentos_fiscales.get(doc.id))?.impreso_at).toBeFalsy(); // el original sigue pendiente

    await imprimirDocumentoFiscal(doc.id); // original
    await imprimirDocumentoFiscal(doc.id, { copia: "emisor" });
    expect(textos(enviados[2].body).join("|")).not.toContain("REIMPRESIÓN");
  });

  it("sin logo cacheado imprime igual (logo null)", async () => {
    const doc = await nuevoDocumento();
    await imprimirDocumentoFiscal(doc.id);
    expect(enviados[0].body.logoPngBase64).toBeNull();
    expect(enviados[0].body.instrucciones[0]).toEqual({ op: "logo" });
  });

  it("errores claros: sin agente configurado o documento inexistente", async () => {
    const doc = await nuevoDocumento();
    await db.config.put({ clave: "sucursal", valor: { id: "S1", nombre: "X", agenteImpresionUrl: null } });
    expect((await imprimirDocumentoFiscal(doc.id)).error).toMatch(/agente de impresión/);
    expect((await imprimirDocumentoFiscal("no-existe")).ok).toBe(false);
    expect(enviados).toHaveLength(0);
  });
});

describe("imprimirPrecuenta", () => {
  it("dice NO ES DOCUMENTO FISCAL y no toca correlativos ni documentos", async () => {
    await db.ordenes.add({
      id: "O1", sucursal_id: "S1", mesa_id: "M1", usuario_id: "U1", estado: "enviada", total: 230,
      cliente_nombre: "Ana", personas: 2, numero_dia: 7, lista_cocina: false, created_at: new Date().toISOString(),
      enviada_at: null, pagada_at: null, cancelada_at: null, motivo_cancelacion: null,
    });
    await db.orden_items.add({
      id: "I1", orden_id: "O1", producto_id: "P1", nombre_producto: "Tacos", cantidad: 2, precio_unitario: 115,
      nota: null, impreso: true, origen_cliente: false, created_at: new Date().toISOString(),
    });

    const r = await imprimirPrecuenta("O1", "Mesa 5");
    expect(r.ok).toBe(true);
    const t = textos(enviados[0].body);
    expect(t).toContain("NO ES DOCUMENTO FISCAL");
    expect(t).toContain("PRE-CUENTA");
    expect(t).toContain("Mesa: Mesa 5");
    expect(t.join("|")).not.toMatch(/FACTURA|CAI:|Original/);
    expect((await db.rangos_cai.get("R1"))!.siguiente).toBe(1);
    expect(await db.documentos_fiscales.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it("no imprime una pre-cuenta de una orden sin productos", async () => {
    await db.ordenes.add({
      id: "O2", sucursal_id: "S1", mesa_id: "M1", usuario_id: "U1", estado: "abierta", total: 0,
      cliente_nombre: null, personas: null, numero_dia: 1, lista_cocina: false, created_at: new Date().toISOString(),
      enviada_at: null, pagada_at: null, cancelada_at: null, motivo_cancelacion: null,
    });
    expect((await imprimirPrecuenta("O2", "Mesa 1")).ok).toBe(false);
    expect(enviados).toHaveLength(0);
  });
});
