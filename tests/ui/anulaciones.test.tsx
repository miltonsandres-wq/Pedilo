// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
const solicitar = vi.fn();
vi.mock("@/app/pos/documentos/actions", () => ({ solicitarAnulacion: (...a: unknown[]) => solicitar(...a) }));
vi.mock("@/lib/supabase/client", async () => ({ createClient: (await import("./supabaseSinRed")).clienteSinRed }));
vi.mock("@/lib/fiscal/impresion", () => ({ imprimirDocumentoFiscal: vi.fn(), imprimirPrecuenta: vi.fn() }));

import { emitirDocumentoFiscal } from "@/lib/fiscal/emision";
import { ListaDocumentos } from "@/components/pos/ListaDocumentos";
import { CobrosSinFactura } from "@/components/pos/CobrosSinFactura";
import { SolicitarAnulacion } from "@/components/pos/SolicitarAnulacion";
import type { VentaDia } from "@/lib/ventas/ventasDelDia";
import { configFiscal, limpiarDb, rangoCai, sembrarFiscal, sembrarOrden } from "./fixtures";

afterEach(cleanup);
beforeEach(async () => {
  await limpiarDb();
  solicitar.mockReset();
  refresh.mockReset();
  solicitar.mockResolvedValue({ ok: true, mensaje: "Solicitud enviada." });
});

describe("el cajero pide la anulación (el admin la aprueba)", () => {
  it("exige un motivo y avisa que el administrador tiene que aprobarla", async () => {
    const user = userEvent.setup();
    render(<SolicitarAnulacion ordenId="O1" documentoId={null} />);
    await user.click(screen.getByRole("button", { name: /Solicitar anulación/ }));
    expect(screen.getByText(/administrador tiene que aprobarla/)).toBeTruthy();
    const enviar = screen.getByRole("button", { name: "Enviar solicitud" }) as HTMLButtonElement;
    expect(enviar.disabled).toBe(true); // sin motivo no se puede enviar
    await user.type(screen.getByLabelText("Motivo de la anulación"), "Se cobró dos veces");
    expect(enviar.disabled).toBe(false);
  });

  it("al enviarla queda «pendiente de aprobación» y no anula nada", async () => {
    const user = userEvent.setup();
    render(<SolicitarAnulacion ordenId="O1" documentoId="D1" />);
    await user.click(screen.getByRole("button", { name: /Solicitar anulación/ }));
    await user.type(screen.getByLabelText("Motivo de la anulación"), "Error de monto");
    await user.click(screen.getByRole("button", { name: "Enviar solicitud" }));
    await waitFor(() => expect(solicitar).toHaveBeenCalledWith({ ordenId: "O1", documentoId: "D1", motivo: "Error de monto" }));
    expect(await screen.findByText(/pendiente de aprobación/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Solicitar anulación/ })).toBeNull();
  });

  it("si el servidor la rechaza muestra el error y deja corregir", async () => {
    solicitar.mockResolvedValue({ ok: false, error: "Ya hay una solicitud pendiente para esta venta." });
    const user = userEvent.setup();
    render(<SolicitarAnulacion ordenId="O1" documentoId={null} />);
    await user.click(screen.getByRole("button", { name: /Solicitar anulación/ }));
    await user.type(screen.getByLabelText("Motivo de la anulación"), "Cliente se fue");
    await user.click(screen.getByRole("button", { name: "Enviar solicitud" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Ya hay una solicitud pendiente");
  });

  it("muestra la razón del admin si la rechazó y permite volver a pedirla; aprobada ya no ofrece nada", async () => {
    const { rerender } = render(
      <SolicitarAnulacion ordenId="O1" documentoId={null} solicitud={{ orden_id: "O1", estado: "rechazada", motivo: "x", respuesta: "La venta es correcta" }} />
    );
    expect(screen.getByText(/rechazó tu solicitud: La venta es correcta/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Volver a solicitar anulación/ })).toBeTruthy();

    rerender(<SolicitarAnulacion ordenId="O1" documentoId={null} solicitud={{ orden_id: "O1", estado: "aprobada", motivo: "x", respuesta: null }} />);
    expect(screen.getByText(/anulación aprobada/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("dónde aparece la acción", () => {
  it("lista de facturas CAI: el cajero ve «Solicitar anulación»; el admin no (él anula directo)", async () => {
    await sembrarFiscal(configFiscal(), [rangoCai()]);
    const { ordenId } = await sembrarOrden();
    await emitirDocumentoFiscal({ ordenId, sucursalId: "S1", usuarioId: "U1", lineas: [{ nombre: "Tacos", cantidad: 1, precioUnitario: 115, tasa: "15" }] });

    const { unmount } = render(<ListaDocumentos sucursalId="S1" usuarioId="U1" rol="cajero" />);
    expect(await screen.findByRole("button", { name: /Solicitar anulación/ })).toBeTruthy();
    unmount();
    render(<ListaDocumentos sucursalId="S1" usuarioId="U1" rol="admin" />);
    await screen.findByText(/001-001-01-/);
    expect(screen.queryByRole("button", { name: /Solicitar anulación/ })).toBeNull();
  });

  const venta = (over: Partial<VentaDia> = {}): VentaDia => ({
    ordenId: "O9", sucursalId: "S1", mesa: "Mesa 1", numeroDia: 9, hora: "2026-10-07T15:00:00Z", cliente: "—", tipo: "sin_factura", canal: "local",
    documentoId: null, numeroFactura: null, formasPago: ["efectivo"], total: 80, anulada: false, motivoAnulacion: null, solicitud: null, ...over,
  });

  it("cobros sin CAI de hoy: el cajero puede pedir anularlos; los ya anulados no", () => {
    render(<CobrosSinFactura puedeSolicitar ventas={[venta(), venta({ ordenId: "O10", numeroDia: 10, anulada: true })]} />);
    expect(screen.getAllByRole("button", { name: /Solicitar anulación/ })).toHaveLength(1);
    expect(screen.getByText("anulada")).toBeTruthy();
  });

  it("sin permiso (mesero) no hay botón", () => {
    render(<CobrosSinFactura puedeSolicitar={false} ventas={[venta()]} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
