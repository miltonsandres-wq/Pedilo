// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabase/client", async () => ({ createClient: (await import("./supabaseSinRed")).clienteSinRed }));
const imprimir = vi.fn();
vi.mock("@/lib/fiscal/impresion", () => ({
  imprimirDocumentoFiscal: (id: string, o?: unknown) => imprimir(id, o),
  imprimirPrecuenta: vi.fn(),
}));

import { db } from "@/lib/offline/db";
import { emitirDocumentoFiscal } from "@/lib/fiscal/emision";
import { ListaDocumentos } from "@/components/pos/ListaDocumentos";
import { configFiscal, limpiarDb, rangoCai, sembrarFiscal } from "./fixtures";

afterEach(cleanup);
beforeEach(async () => {
  await limpiarDb();
  imprimir.mockReset();
  imprimir.mockResolvedValue({ ok: true });
});

const rangoNota = () => rangoCai({ id: "RN", tipo_doc: "03", clase: "nota_credito", cai: "112233-445566-778899-AABBCC-DDEEFF-03", desde: 1, hasta: 10 });

async function factura() {
  return emitirDocumentoFiscal({
    ordenId: crypto.randomUUID(), sucursalId: "S1", usuarioId: "U1",
    lineas: [{ nombre: "Tacos", cantidad: 2, precioUnitario: 115, tasa: "15" }],
  });
}

const tarjeta = (numero: string) => screen.getByText(numero).closest("div.rounded-xl") as HTMLElement;

describe("ListaDocumentos", () => {
  it("lista los documentos con su estado de sincronización y permite reimprimir y sacar la copia", async () => {
    await sembrarFiscal(configFiscal(), [rangoCai()]);
    const f = await factura();
    const user = userEvent.setup();
    render(<ListaDocumentos sucursalId="S1" usuarioId="U1" rol="cajero" />);

    const t = within(await waitFor(() => tarjeta("001-001-01-00000001")));
    expect(t.getByText("por sincronizar")).toBeTruthy();
    expect(t.getByText("L. 230.00")).toBeTruthy();

    await user.click(t.getByRole("button", { name: /Reimprimir/ }));
    await waitFor(() => expect(imprimir).toHaveBeenCalledWith(f.id, { copia: "cliente" }));
    await user.click(t.getByRole("button", { name: "Copia emisor" }));
    await waitFor(() => expect(imprimir).toHaveBeenCalledWith(f.id, { copia: "emisor" }));
  });

  it("el cajero no ve el botón de nota de crédito; el admin sí", async () => {
    await sembrarFiscal(configFiscal(), [rangoCai(), rangoNota()]);
    await factura();
    const { unmount } = render(<ListaDocumentos sucursalId="S1" usuarioId="U1" rol="cajero" />);
    await screen.findByText("001-001-01-00000001");
    expect(screen.queryByRole("button", { name: /Nota de crédito/ })).toBeNull();
    unmount();
    render(<ListaDocumentos sucursalId="S1" usuarioId="U1" rol="admin" />);
    expect(await screen.findByRole("button", { name: /Nota de crédito/ })).toBeTruthy();
  });

  it("emite la nota de crédito con motivo, la imprime y marca la factura como acreditada", async () => {
    await sembrarFiscal(configFiscal(), [rangoCai(), rangoNota()]);
    const f = await factura();
    const user = userEvent.setup();
    render(<ListaDocumentos sucursalId="S1" usuarioId="U1" rol="admin" />);

    await user.click(await screen.findByRole("button", { name: /Nota de crédito/ }));
    const emitir = screen.getByRole("button", { name: "Emitir nota de crédito" }) as HTMLButtonElement;
    expect(emitir.disabled).toBe(true); // sin motivo no se puede
    await user.type(screen.getByPlaceholderText("Motivo (obligatorio)"), "Cliente devolvió la orden");
    await user.click(emitir);

    expect(await screen.findByText(/Nota de crédito 001-001-03-00000001 emitida e impresa/)).toBeTruthy();
    await waitFor(() => expect(imprimir).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/acreditada · 001-001-03-00000001/)).toBeTruthy();
    // ya no se ofrece acreditar de nuevo
    expect(screen.queryByRole("button", { name: /Nota de crédito$/ })).toBeNull();
    const nota = (await db.documentos_fiscales.toArray()).find((d) => d.clase === "nota_credito");
    expect(nota).toMatchObject({ documento_referencia_id: f.id, motivo_nota: "Cliente devolvió la orden" });
  });

  it("si no hay rango de notas de crédito muestra el motivo del bloqueo y no emite nada", async () => {
    await sembrarFiscal(configFiscal(), [rangoCai()]);
    await factura();
    const user = userEvent.setup();
    render(<ListaDocumentos sucursalId="S1" usuarioId="U1" rol="admin" />);
    await user.click(await screen.findByRole("button", { name: /Nota de crédito/ }));
    await user.type(screen.getByPlaceholderText("Motivo (obligatorio)"), "Error");
    await user.click(screen.getByRole("button", { name: "Emitir nota de crédito" }));
    expect(await screen.findByText(/No hay un CAI cargado para notas de crédito/)).toBeTruthy();
    expect((await db.documentos_fiscales.toArray()).filter((d) => d.clase === "nota_credito")).toHaveLength(0);
  });

  it("una factura anulada o rechazada por el servidor no se puede acreditar", async () => {
    await sembrarFiscal(configFiscal(), [rangoCai(), rangoNota()]);
    const a = await factura();
    await db.documentos_fiscales.update(a.id, { estado: "anulada" });
    const c = await factura();
    await db.documentos_fiscales.update(c.id, { sync_estado: "conflicto", sync_detalle: "duplicado: ya existe" });
    render(<ListaDocumentos sucursalId="S1" usuarioId="U1" rol="admin" />);
    await screen.findByText("001-001-01-00000001");
    expect(screen.queryByRole("button", { name: /Nota de crédito/ })).toBeNull();
    expect(screen.getByText("anulada")).toBeTruthy();
    expect(screen.getByText("duplicado: ya existe")).toBeTruthy();
  });
});
