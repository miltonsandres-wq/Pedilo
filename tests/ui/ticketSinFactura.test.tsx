// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/supabase/client", async () => ({ createClient: (await import("./supabaseSinRed")).clienteSinRed }));
const imprimirDirecto = vi.fn();
vi.mock("@/lib/printing/imprimirDirecto", () => ({ imprimirDirecto: (...a: unknown[]) => imprimirDirecto(...a) }));

import { db } from "@/lib/offline/db";
import { FormularioCobro } from "@/components/pos/DetalleMesa";
import { configFiscal, limpiarDb, rangoCai, sembrarFiscal, sembrarOrden } from "./fixtures";

afterEach(cleanup);
beforeEach(async () => {
  await limpiarDb();
  imprimirDirecto.mockReset();
  imprimirDirecto.mockResolvedValue({ ok: true });
});

async function abrirCobro(opciones: { permiso?: boolean; referenciaInicial?: string } = {}) {
  const { ordenId, mesaId } = await sembrarOrden();
  const onCobrado = vi.fn();
  const user = userEvent.setup();
  render(
    <FormularioCobro
      ordenId={ordenId} mesaId={mesaId} usuarioId="U1" total={230} formasDisponibles={["efectivo", "tarjeta"]}
      puedeTicketSinFactura={opciones.permiso ?? false} referenciaInicial={opciones.referenciaInicial}
      onCerrar={vi.fn()} onCobrado={onCobrado}
    />
  );
  return { user, onCobrado, ordenId };
}

const tipoCobro = () => screen.queryByRole("group", { name: "Tipo de cobro" });

describe("al cobrar: Facturar o Ticket sin factura", () => {
  it("ya no hay botones de delivery externo ni de con CAI / sin CAI", async () => {
    await sembrarFiscal(configFiscal({ ticketSinFactura: true }));
    await abrirCobro({ permiso: true });
    expect(await screen.findByRole("button", { name: "Facturar" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Delivery externo/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Factura CAI|Cobro normal/ })).toBeNull();
  });

  it("si el dueño NO activó el ticket sin factura, solo se puede facturar", async () => {
    await sembrarFiscal(configFiscal({ ticketSinFactura: false }));
    await abrirCobro({ permiso: true });
    expect(await screen.findByText("Factura con RTN")).toBeTruthy();
    expect(tipoCobro()).toBeNull();
    expect(screen.queryByRole("button", { name: "Ticket sin factura" })).toBeNull();
    expect(screen.getByRole("button", { name: /Cobrar e imprimir factura/ })).toBeTruthy();
  });

  it("si el dueño lo activó pero el usuario NO tiene el permiso, tampoco aparece", async () => {
    await sembrarFiscal(configFiscal({ ticketSinFactura: true }));
    await abrirCobro({ permiso: false });
    expect(await screen.findByText("Factura con RTN")).toBeTruthy();
    expect(tipoCobro()).toBeNull();
  });

  it("activado por el dueño Y con permiso: aparecen las dos opciones y por omisión se factura", async () => {
    await sembrarFiscal(configFiscal({ ticketSinFactura: true }));
    await abrirCobro({ permiso: true });
    expect(await screen.findByRole("button", { name: "Ticket sin factura" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Facturar" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Factura con RTN")).toBeTruthy(); // datos del cliente opcionales (Consumidor Final)
  });

  it("elegir Ticket sin factura cobra sin factura aunque el CAI esté agotado, marca la orden e imprime el ticket", async () => {
    await sembrarFiscal(configFiscal({ ticketSinFactura: true }), [rangoCai({ siguiente: 101, hasta: 100, estado: "agotado" })]);
    const { user, onCobrado, ordenId } = await abrirCobro({ permiso: true });

    await user.click(await screen.findByRole("button", { name: "Ticket sin factura" }));
    expect(screen.queryByText("Factura con RTN")).toBeNull(); // sin datos fiscales
    expect((screen.getByRole("button", { name: /Cobrar e imprimir ticket/ }) as HTMLButtonElement).disabled).toBe(false); // sin bloqueo por CAI
    await user.click(screen.getByRole("button", { name: /Cobrar e imprimir ticket/ }));

    await waitFor(() => expect(onCobrado).toHaveBeenCalledWith(null));
    expect(imprimirDirecto).toHaveBeenCalledTimes(1);
    expect(imprimirDirecto.mock.calls[0][0].titulo).toBe("Recibo");
    const orden = await db.ordenes.get(ordenId);
    expect(orden).toMatchObject({ estado: "pagada", ticket_sin_factura: true });
    expect(await db.documentos_fiscales.count()).toBe(0);
    expect(await db.pagos.toArray()).toMatchObject([{ forma_pago: "efectivo", monto: 230 }]);
  });

  it("facturar sigue emitiendo la factura y NO marca la orden como ticket sin factura", async () => {
    await sembrarFiscal(configFiscal({ ticketSinFactura: true }));
    const { user, onCobrado, ordenId } = await abrirCobro({ permiso: true });
    await user.click(await screen.findByRole("button", { name: /Cobrar e imprimir factura/ }));
    await waitFor(() => expect(onCobrado).toHaveBeenCalled());
    expect(await db.documentos_fiscales.count()).toBe(1);
    expect((await db.ordenes.get(ordenId))?.ticket_sin_factura).toBeFalsy();
  });

  it("un negocio que no factura con CAI entrega ticket sin pedir nada (no hay selector)", async () => {
    await sembrarFiscal(configFiscal({ activa: false }));
    const { user, onCobrado } = await abrirCobro();
    expect(await screen.findByRole("button", { name: /Cobrar e imprimir ticket/ })).toBeTruthy();
    expect(tipoCobro()).toBeNull();
    await user.click(screen.getByRole("button", { name: /Cobrar e imprimir ticket/ }));
    await waitFor(() => expect(onCobrado).toHaveBeenCalledWith(null));
    expect(imprimirDirecto).toHaveBeenCalledTimes(1);
  });

  it("si no sale el papel, el cobro queda y se ofrece reintentar con el botón del ticket", async () => {
    await sembrarFiscal(configFiscal({ activa: false }));
    imprimirDirecto.mockResolvedValue({ ok: false, error: "Impresora apagada." });
    const { user, onCobrado, ordenId } = await abrirCobro();
    await user.click(await screen.findByRole("button", { name: /Cobrar e imprimir ticket/ }));
    expect(await screen.findByText("Cobro registrado")).toBeTruthy();
    expect(screen.getByText(/Impresora apagada/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Imprimir ticket sin factura/ })).toBeTruthy();
    expect(onCobrado).not.toHaveBeenCalled();
    expect((await db.ordenes.get(ordenId))?.estado).toBe("pagada");
  });

  it("en un pedido de plataforma la referencia (empresa / # de pedido) ya viene escrita", async () => {
    await sembrarFiscal(configFiscal({ activa: false }));
    await abrirCobro({ referenciaInicial: "PedidosYa #8841" });
    expect(((await screen.findByLabelText(/Referencia/)) as HTMLInputElement).value).toBe("PedidosYa #8841");
  });
});
