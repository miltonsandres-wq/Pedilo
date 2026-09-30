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
vi.mock("@/lib/fiscal/impresion", () => ({
  imprimirDocumentoFiscal: (id: string, o?: unknown) => imprimir(id, o),
  imprimirPrecuenta: vi.fn(),
}));

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
    expect(await screen.findByText(/no está vinculada a un punto de emisión/)).toBeTruthy();
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
    expect(await screen.findByText(/No hay puntos de emisión libres/)).toBeTruthy();
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

  it("imprime el original apenas abre, una sola vez, y confirma", async () => {
    await db.documentos_fiscales.add(doc());
    imprimir.mockResolvedValue({ ok: true });
    render(<FacturaEmitidaModal documentoId="F1" />);

    expect(await screen.findByText("001-001-01-00000042")).toBeTruthy();
    expect(screen.getByText(/Ana López/)).toBeTruthy();
    expect(await screen.findByText("Impresa")).toBeTruthy();
    expect(imprimir).toHaveBeenCalledTimes(1);
    expect(imprimir).toHaveBeenCalledWith("F1", { copia: "cliente" });
  });

  it("no reimprime solo si el original ya salió (p. ej. al recargar la página)", async () => {
    await db.documentos_fiscales.add(doc({ impreso_at: new Date().toISOString() }));
    render(<FacturaEmitidaModal documentoId="F1" />);
    await screen.findByText("001-001-01-00000042");
    await new Promise((r) => setTimeout(r, 80));
    expect(imprimir).not.toHaveBeenCalled();
  });

  it("si falla la impresión lo dice, aclara que la factura ya quedó emitida y permite reintentar", async () => {
    await db.documentos_fiscales.add(doc());
    imprimir.mockResolvedValueOnce({ ok: false, error: "connect ECONNREFUSED" });
    const user = userEvent.setup();
    render(<FacturaEmitidaModal documentoId="F1" />);

    expect(await screen.findByText(/No se pudo imprimir: connect ECONNREFUSED/)).toBeTruthy();
    expect(screen.getByText(/La factura ya quedó emitida/)).toBeTruthy();

    imprimir.mockResolvedValueOnce({ ok: true });
    await user.click(screen.getByRole("button", { name: /Reintentar/ }));
    expect(await screen.findByText("Impresa")).toBeTruthy();
    expect(imprimir).toHaveBeenCalledTimes(2);
  });

  it("«Copia emisor» pide la copia del emisor y «Listo» cierra volviendo al mapa", async () => {
    await db.documentos_fiscales.add(doc({ impreso_at: new Date().toISOString() }));
    imprimir.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<FacturaEmitidaModal documentoId="F1" />);
    await screen.findByText("001-001-01-00000042");

    await user.click(screen.getByRole("button", { name: "Copia emisor" }));
    await waitFor(() => expect(imprimir).toHaveBeenCalledWith("F1", { copia: "emisor" }));

    await user.click(screen.getByRole("button", { name: "Listo" }));
    expect(replace).toHaveBeenCalledWith("/pos");
  });
});
