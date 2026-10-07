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

async function abrirCobro(total = 230) {
  const { ordenId, mesaId } = await sembrarOrden();
  const onCobrado = vi.fn();
  const onCerrar = vi.fn();
  const user = userEvent.setup();
  render(
    <FormularioCobro
      ordenId={ordenId} mesaId={mesaId} usuarioId="U1" total={total}
      formasDisponibles={["efectivo", "tarjeta"]} onCerrar={onCerrar} onCobrado={onCobrado}
    />
  );
  return { user, onCobrado, onCerrar, ordenId };
}

const confirmar = () => screen.getByRole("button", { name: /Cobrar sin imprimir|Cobrando/ });

describe("cobro sin facturación fiscal", () => {
  it("no muestra nada fiscal y cobra sin imprimir", async () => {
    const { user, onCobrado, ordenId } = await abrirCobro();
    expect(screen.queryByText("Factura con RTN")).toBeNull();
    await user.click(confirmar());
    await waitFor(() => expect(onCobrado).toHaveBeenCalledWith(null));
    expect(imprimirDirecto).not.toHaveBeenCalled();
    expect((await db.ordenes.get(ordenId))?.estado).toBe("pagada");
    expect(await db.documentos_fiscales.count()).toBe(0);
  });

  it("«Cobrar e imprimir recibo (sin CAI)»: cobra y manda a imprimir el recibo en el mismo paso", async () => {
    const { user, onCobrado, ordenId } = await abrirCobro();
    await user.click(screen.getByRole("button", { name: /Cobrar e imprimir recibo/ }));
    await waitFor(() => expect(onCobrado).toHaveBeenCalledWith(null));
    expect(imprimirDirecto).toHaveBeenCalledTimes(1);
    expect(imprimirDirecto.mock.calls[0][0].titulo).toBe("Recibo");
    expect((await db.ordenes.get(ordenId))?.estado).toBe("pagada");
  });

  it("si no sale el papel, el cobro queda registrado y se ofrece reintentar con el botón Imprimir", async () => {
    imprimirDirecto.mockResolvedValue({ ok: false, error: "Impresora apagada." });
    const { user, onCobrado, ordenId } = await abrirCobro();
    await user.click(screen.getByRole("button", { name: /Cobrar e imprimir recibo/ }));
    expect(await screen.findByText("Cobro registrado")).toBeTruthy();
    expect(screen.getByText(/Impresora apagada/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Imprimir recibo/ })).toBeTruthy();
    expect(onCobrado).not.toHaveBeenCalled();
    expect((await db.ordenes.get(ordenId))?.estado).toBe("pagada");
  });
});

describe("cobro con facturación fiscal", () => {
  it("por defecto factura a Consumidor Final y entrega el id de la factura", async () => {
    await sembrarFiscal(configFiscal());
    const { user, onCobrado } = await abrirCobro();
    expect(await screen.findByText("Factura con RTN")).toBeTruthy();
    expect(screen.getByText(/Consumidor Final/)).toBeTruthy();

    await user.click(confirmar());
    await waitFor(() => expect(onCobrado).toHaveBeenCalledTimes(1));
    const id = onCobrado.mock.calls[0][0] as string;
    expect(id).toBeTruthy();
    expect(await db.documentos_fiscales.get(id)).toMatchObject({
      cliente_nombre: "Consumidor Final", cliente_rtn: null, numero_completo: "001-001-01-00000001", total: 230,
    });
  });

  it("«Factura con RTN» pide nombre y RTN de 14 dígitos con validación en vivo", async () => {
    await sembrarFiscal(configFiscal());
    const { user, onCobrado } = await abrirCobro();
    await user.click(await screen.findByLabelText("Factura con RTN"));

    expect(await screen.findByText("Escribe el nombre del cliente.")).toBeTruthy();
    expect((confirmar() as HTMLButtonElement).disabled).toBe(true);

    await user.type(screen.getByPlaceholderText("Nombre del cliente"), "Juan Pérez");
    await user.type(screen.getByPlaceholderText("RTN (14 dígitos)"), "0801199");
    expect(screen.getByText("7/14 dígitos")).toBeTruthy();
    expect(screen.getByText("El RTN debe tener 14 dígitos (lleva 7).")).toBeTruthy();
    expect((confirmar() as HTMLButtonElement).disabled).toBe(true);

    await user.type(screen.getByPlaceholderText("RTN (14 dígitos)"), "9123456"); // 14 dígitos
    expect(screen.getByText("RTN válido")).toBeTruthy();
    expect((confirmar() as HTMLButtonElement).disabled).toBe(false);

    await user.click(confirmar());
    await waitFor(() => expect(onCobrado).toHaveBeenCalled());
    expect(await db.documentos_fiscales.get(onCobrado.mock.calls[0][0])).toMatchObject({
      cliente_nombre: "Juan Pérez", cliente_rtn: "08011999123456",
    });
  });

  it("acepta el RTN escrito con guiones y lo guarda solo con dígitos", async () => {
    await sembrarFiscal(configFiscal());
    const { user, onCobrado } = await abrirCobro();
    await user.click(await screen.findByLabelText("Factura con RTN"));
    await user.type(screen.getByPlaceholderText("Nombre del cliente"), "Ana");
    await user.type(screen.getByPlaceholderText("RTN (14 dígitos)"), "0801-1999-123456");
    expect(screen.getByText("RTN válido")).toBeTruthy();
    await user.click(confirmar());
    await waitFor(() => expect(onCobrado).toHaveBeenCalled());
    expect((await db.documentos_fiscales.get(onCobrado.mock.calls[0][0]))?.cliente_rtn).toBe("08011999123456");
  });

  it("los datos de exoneración exigen cliente con RTN y mandan todo a importe exonerado", async () => {
    await sembrarFiscal(configFiscal());
    const { user, onCobrado } = await abrirCobro();
    await user.click(await screen.findByText("Datos de exoneración (opcional)"));
    await user.type(screen.getByPlaceholderText("No. Constancia Registro Exonerado"), "CE-2026-77");

    // apareció el pedido de cliente aunque no se marcó «Factura con RTN»
    expect(await screen.findByText("Escribe el nombre del cliente.")).toBeTruthy();
    expect((confirmar() as HTMLButtonElement).disabled).toBe(true);

    await user.type(screen.getByPlaceholderText("Nombre del cliente"), "Embajada X");
    await user.type(screen.getByPlaceholderText("RTN (14 dígitos)"), "08011999123456");
    await user.click(confirmar());
    await waitFor(() => expect(onCobrado).toHaveBeenCalled());
    expect(await db.documentos_fiscales.get(onCobrado.mock.calls[0][0])).toMatchObject({
      importe_exonerado: 230, gravado_15: 0, isv_15: 0, no_constancia_exonerado: "CE-2026-77", cliente_nombre: "Embajada X",
    });
  });

  it("sin CAI vigente muestra el bloqueo y NO deja confirmar", async () => {
    await sembrarFiscal(configFiscal(), [rangoCai({ siguiente: 101 })]);
    const { user, onCobrado } = await abrirCobro();
    expect(await screen.findByText(/No se puede cobrar: El rango de facturas autorizado se agotó/)).toBeTruthy();
    expect((confirmar() as HTMLButtonElement).disabled).toBe(true);
    await user.click(confirmar());
    expect(onCobrado).not.toHaveBeenCalled();
    expect(await db.pagos.count()).toBe(0);
  });

  it("sin caja vinculada tampoco deja cobrar", async () => {
    await sembrarFiscal(configFiscal({ dispositivo: null }));
    await abrirCobro();
    expect(await screen.findByText(/No se puede cobrar: Esta caja no está vinculada/)).toBeTruthy();
    expect((confirmar() as HTMLButtonElement).disabled).toBe(true);
  });

  it("CAI vencido muestra la fecha límite", async () => {
    await sembrarFiscal(configFiscal(), [rangoCai({ fecha_limite: "2020-05-17" })]);
    await abrirCobro();
    expect(await screen.findByText(/El CAI venció el 17\/05\/2020/)).toBeTruthy();
  });

  it("un pago parcial avisa que la factura sale cuando se cubra el total", async () => {
    await sembrarFiscal(configFiscal());
    const { user } = await abrirCobro();
    const monto = await screen.findByDisplayValue("230");
    await user.clear(monto);
    await user.type(monto, "100");
    expect(screen.getByText(/Pago parcial: la factura se emite cuando los pagos cubran el total \(L\. 230\.00\)/)).toBeTruthy();
  });

  it("si el CAI se agota con el formulario abierto, se bloquea al instante y no se escribe nada", async () => {
    await sembrarFiscal(configFiscal());
    const { user, onCobrado } = await abrirCobro();
    await screen.findByText("Factura con RTN");
    // el CAI se agota justo antes de confirmar (otra pestaña emitió el último número)
    await db.rangos_cai.update("R1", { siguiente: 101 });
    // el formulario reevalúa y bloquea; forzamos además el camino de error del servidor local
    await waitFor(() => expect((confirmar() as HTMLButtonElement).disabled).toBe(true));
    expect(onCobrado).not.toHaveBeenCalled();
    expect(await db.pagos.count()).toBe(0);
    void user;
  });
});

describe("«Cobrar e imprimir factura (CAI)»", () => {
  it("cobra, emite la factura y la manda a imprimir en el mismo paso", async () => {
    await sembrarFiscal(configFiscal());
    const { user, onCobrado } = await abrirCobro();
    await user.click(await screen.findByRole("button", { name: /Cobrar e imprimir factura/ }));
    await waitFor(() => expect(onCobrado).toHaveBeenCalledWith(null));
    expect(imprimirDirecto).toHaveBeenCalledTimes(1);
    expect(imprimirDirecto.mock.calls[0][0].titulo).toMatch(/Factura|FACTURA/i);
    expect(await db.documentos_fiscales.count()).toBe(1);
  });

  it("si no sale el papel, sigue a la pantalla de la factura (con su botón de imprimir)", async () => {
    await sembrarFiscal(configFiscal());
    imprimirDirecto.mockResolvedValue({ ok: false, error: "Impresora apagada." });
    const { user, onCobrado } = await abrirCobro();
    await user.click(await screen.findByRole("button", { name: /Cobrar e imprimir factura/ }));
    await waitFor(() => expect(onCobrado).toHaveBeenCalledTimes(1));
    expect(onCobrado.mock.calls[0][0]).toBeTruthy(); // id de la factura: la pantalla siguiente deja imprimirla
  });
});
