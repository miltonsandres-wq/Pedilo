// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace }) }));

const vincular = vi.fn();
vi.mock("@/lib/fiscal/sincronizacion", () => ({ vincularDispositivoLocal: (id: string) => vincular(id) }));

const imprimir = vi.fn();
const armar = vi.fn();
const agente = vi.fn();
vi.mock("@/lib/fiscal/impresion", () => ({
  imprimirDocumentoFiscal: (id: string, o?: unknown) => imprimir(id, o),
  imprimirPrecuenta: vi.fn(),
  agenteImpresionUrl: () => agente(),
  marcarFacturaImpresa: vi.fn(),
  armarFactura: (id: string, o?: unknown) => armar(id, o),
}));

// Impresión directa a la impresora de la sucursal (agente)
const enviarImpresion = vi.fn();
vi.mock("@/lib/printing/enviarComanda", () => ({ servicioImpresion: { enviarImpresion: (...a: unknown[]) => enviarImpresion(...a) } }));

// La lista de dispositivos viene de Supabase
const dispositivosRemotos = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order"]) q[m] = () => q;
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve(dispositivosRemotos()).then(ok);
      return q;
    },
  }),
}));

import { db, type DocumentoFiscalLocal } from "@/lib/offline/db";
import { AvisosFiscales } from "@/components/pos/AvisosFiscales";
import { FacturaEmitidaModal } from "@/components/pos/FacturaEmitidaModal";
import { fechaLocalHN } from "@/lib/fiscal/formato";
import { configFiscal, limpiarDb, rangoCai, sembrarFiscal } from "./fixtures";

afterEach(cleanup);
beforeEach(async () => {
  await limpiarDb();
  vincular.mockReset();
  imprimir.mockReset();
  enviarImpresion.mockReset();
  agente.mockReset();
  agente.mockResolvedValue("https://agente.local");
  armar.mockReset();
  armar.mockResolvedValue({
    ok: true,
    doc: {},
    ticket: { titulo: "Factura", construir: () => [{ op: "texto", texto: "FACTURA DE PRUEBA" }], logoPngBase64: null },
  });
  replace.mockReset();
  dispositivosRemotos.mockReset();
});

const enDias = (n: number) => fechaLocalHN(new Date(Date.now() + n * 86_400_000));

describe("AvisosFiscales", () => {
  it("no muestra nada si el negocio no factura", async () => {
    await sembrarFiscal(configFiscal({ activa: false }));
    const { container } = render(<AvisosFiscales />);
    await new Promise((r) => setTimeout(r, 50));
    expect(container.textContent).toBe("");
  });

  it("todo en orden: sin avisos", async () => {
    await sembrarFiscal(configFiscal(), [rangoCai({ siguiente: 5, fecha_limite: enDias(200) })]);
    const { container } = render(<AvisosFiscales />);
    await new Promise((r) => setTimeout(r, 80));
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("caja sin vincular: aviso rojo con botón para vincular", async () => {
    await sembrarFiscal(configFiscal({ dispositivo: null }));
    render(<AvisosFiscales />);
    expect(await screen.findByText(/todavía no está vinculada a la sucursal/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Vincular esta caja/ })).toBeTruthy();
  });

  it("vincular: lista solo los puntos libres y vincula el elegido", async () => {
    await sembrarFiscal(configFiscal({ dispositivo: null }));
    await db.config.put({ clave: "sucursal", valor: { id: "S1", nombre: "Centro", agenteImpresionUrl: null } });
    dispositivosRemotos.mockReturnValue({
      data: [
        { id: "D1", nombre: "Caja 1", establecimiento: "001", punto_emision: "001", vinculo_hash: null, activo: true },
        { id: "D2", nombre: "Caja 2 (ocupada)", establecimiento: "001", punto_emision: "002", vinculo_hash: "abc", activo: true },
        { id: "D3", nombre: "Caja vieja", establecimiento: "001", punto_emision: "003", vinculo_hash: null, activo: false },
      ],
      error: null,
    });
    vincular.mockResolvedValue({ id: "D1" });
    const user = userEvent.setup();
    render(<AvisosFiscales />);

    await user.click(await screen.findByRole("button", { name: /Vincular esta caja/ }));
    expect(await screen.findByText("Caja 1")).toBeTruthy();
    expect(screen.queryByText(/Caja 2/)).toBeNull(); // ya vinculada a otra caja
    expect(screen.queryByText("Caja vieja")).toBeNull(); // desactivada

    await user.click(screen.getByText("Caja 1"));
    await waitFor(() => expect(vincular).toHaveBeenCalledWith("D1"));
    await waitFor(() => expect(screen.queryByText("Elige el que le corresponde a este dispositivo.", { exact: false })).toBeNull());
  });

  it("vincular: si el punto ya lo tiene otra caja muestra el motivo", async () => {
    await sembrarFiscal(configFiscal({ dispositivo: null }));
    await db.config.put({ clave: "sucursal", valor: { id: "S1", nombre: "Centro", agenteImpresionUrl: null } });
    dispositivosRemotos.mockReturnValue({
      data: [{ id: "D1", nombre: "Caja 1", establecimiento: "001", punto_emision: "001", vinculo_hash: null, activo: true }],
      error: null,
    });
    vincular.mockRejectedValue(new Error("Ese punto de emisión ya está vinculado a otra caja."));
    const user = userEvent.setup();
    render(<AvisosFiscales />);
    await user.click(await screen.findByRole("button", { name: /Vincular esta caja/ }));
    await user.click(await screen.findByText("Caja 1"));
    expect(await screen.findByText("Ese punto de emisión ya está vinculado a otra caja.")).toBeTruthy();
  });

  it("vincular: sin puntos libres explica qué hacer", async () => {
    await sembrarFiscal(configFiscal({ dispositivo: null }));
    await db.config.put({ clave: "sucursal", valor: { id: "S1", nombre: "Centro", agenteImpresionUrl: null } });
    dispositivosRemotos.mockReturnValue({ data: [], error: null });
    const user = userEvent.setup();
    render(<AvisosFiscales />);
    await user.click(await screen.findByRole("button", { name: /Vincular esta caja/ }));
    expect(await screen.findByText(/ya está vinculada a otro equipo/)).toBeTruthy();
  });

  it("rango agotado o vencido: bloqueo rojo visible", async () => {
    await sembrarFiscal(configFiscal(), [rangoCai({ siguiente: 101 })]);
    render(<AvisosFiscales />);
    expect(await screen.findByText(/Facturación bloqueada\. El rango de facturas autorizado se agotó/)).toBeTruthy();
  });

  it("al 85% consumido: alerta ámbar con lo que queda", async () => {
    await sembrarFiscal(configFiscal(), [rangoCai({ siguiente: 91, fecha_limite: enDias(200) })]);
    render(<AvisosFiscales />);
    expect(await screen.findByText(/Se consumió más del 85 %/)).toBeTruthy();
    expect(screen.getByText(/Quedan 10 facturas/)).toBeTruthy();
  });

  it("a 30 días o menos de la fecha límite: alerta de vencimiento", async () => {
    await sembrarFiscal(configFiscal(), [rangoCai({ siguiente: 5, fecha_limite: enDias(12) })]);
    render(<AvisosFiscales />);
    expect(await screen.findByText(/30 días o menos para la fecha límite/)).toBeTruthy();
    expect(screen.getByText(/y 12 días/)).toBeTruthy();
  });

  it("avisa cuando ya hay un rango siguiente cargado", async () => {
    await sembrarFiscal(configFiscal(), [
      rangoCai({ siguiente: 91, fecha_limite: enDias(200) }),
      rangoCai({ id: "R2", desde: 101, hasta: 200, siguiente: 101, estado: "pendiente", fecha_limite: enDias(300) }),
    ]);
    render(<AvisosFiscales />);
    expect(await screen.findByText(/Ya hay un rango siguiente cargado/)).toBeTruthy();
  });

  it("documentos rechazados por el servidor: aviso rojo con la cantidad", async () => {
    await sembrarFiscal(configFiscal(), [rangoCai({ fecha_limite: enDias(200) })]);
    await db.documentos_fiscales.bulkAdd([
      { id: "a", sync_estado: "conflicto", sync_detalle: "duplicado" },
      { id: "b", sync_estado: "conflicto", sync_detalle: "duplicado" },
      { id: "c", sync_estado: "sincronizado", sync_detalle: null },
    ] as unknown as DocumentoFiscalLocal[]);
    render(<AvisosFiscales />);
    expect(await screen.findByText(/2 documento\(s\) fiscal\(es\) fueron rechazados/)).toBeTruthy();
  });
});

describe("FacturaEmitidaModal", () => {
  const doc = (over: Partial<DocumentoFiscalLocal> = {}) =>
    ({
      id: "F1", numero_completo: "001-001-01-00000042", cliente_nombre: "Ana López", total: 230,
      sync_estado: "pendiente", sync_detalle: null, impreso_at: null, ...over,
    }) as unknown as DocumentoFiscalLocal;

  it("ofrece «Imprimir factura (con CAI)», SIN vista previa y SIN imprimir sola", async () => {
    await db.documentos_fiscales.add(doc());
    render(<FacturaEmitidaModal documentoId="F1" />);

    expect(await screen.findByText("001-001-01-00000042")).toBeTruthy();
    expect(screen.getByText(/Ana López/)).toBeTruthy();
    expect(await screen.findByRole("button", { name: /Imprimir factura/ })).toBeTruthy();
    await new Promise((r) => setTimeout(r, 80));
    expect(screen.queryByText("FACTURA DE PRUEBA")).toBeNull(); // nada de vista previa
    expect(screen.queryByText(/Vista previa/)).toBeNull();
    expect(imprimir).not.toHaveBeenCalled();
    expect(enviarImpresion).not.toHaveBeenCalled();
  });

  it("con agente: al presionar el botón se manda a imprimir a la impresora de la sucursal", async () => {
    await db.documentos_fiscales.add(doc());
    enviarImpresion.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<FacturaEmitidaModal documentoId="F1" />);

    await user.click(await screen.findByRole("button", { name: /Imprimir factura/ }));
    await waitFor(() => expect(enviarImpresion).toHaveBeenCalledTimes(1));
    expect(enviarImpresion.mock.calls[0][1]).toBe("https://agente.local");
    expect(await screen.findByText("Enviado a la impresora.")).toBeTruthy();
  });

  it("SIN agente configurado: el botón principal usa la impresora del equipo", async () => {
    agente.mockResolvedValue(null);
    await db.documentos_fiscales.add(doc());
    render(<FacturaEmitidaModal documentoId="F1" />);

    expect(await screen.findByRole("button", { name: /Imprimir factura/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Impresora de la sucursal/ })).toBeNull();
    await new Promise((r) => setTimeout(r, 80));
    expect(imprimir).not.toHaveBeenCalled();
  });

  it("si falla la impresora de la sucursal muestra el error y deja otra forma de imprimir", async () => {
    await db.documentos_fiscales.add(doc());
    enviarImpresion.mockResolvedValueOnce({ ok: false, error: "connect ECONNREFUSED" });
    const user = userEvent.setup();
    render(<FacturaEmitidaModal documentoId="F1" />);

    await user.click(await screen.findByRole("button", { name: /Imprimir factura/ }));
    expect(await screen.findByText(/connect ECONNREFUSED/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Impresora del equipo/ })).toBeTruthy();
  });

  it("«Copia: Emisor» arma la copia del emisor y «Listo» cierra volviendo al mapa", async () => {
    await db.documentos_fiscales.add(doc({ impreso_at: new Date().toISOString() }));
    const user = userEvent.setup();
    render(<FacturaEmitidaModal documentoId="F1" />);
    await screen.findByText("001-001-01-00000042");

    await user.click(screen.getByRole("button", { name: "Copia: Emisor" }));
    await waitFor(() => expect(armar).toHaveBeenCalledWith("F1", { copia: "emisor" }));

    await user.click(screen.getByRole("button", { name: "Listo" }));
    expect(replace).toHaveBeenCalledWith("/pos");
  });
});
