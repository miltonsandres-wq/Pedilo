// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/supabase/client", async () => ({ createClient: (await import("./supabaseSinRed")).clienteSinRed }));

import { db } from "@/lib/offline/db";
import { FormularioCobro } from "@/components/pos/DetalleMesa";
import { configFiscal, limpiarDb, rangoCai, sembrarFiscal, sembrarOrden } from "./fixtures";

afterEach(cleanup);
beforeEach(limpiarDb);

async function abrirCobro(formas: ("efectivo" | "tarjeta" | "transferencia" | "delivery_externo")[] = ["efectivo", "tarjeta"]) {
  const { ordenId, mesaId } = await sembrarOrden();
  const onCobrado = vi.fn();
  const user = userEvent.setup();
  render(
    <FormularioCobro ordenId={ordenId} mesaId={mesaId} usuarioId="U1" total={230} formasDisponibles={formas} onCerrar={vi.fn()} onCobrado={onCobrado} />
  );
  return { user, onCobrado, ordenId };
}

describe("opción «Delivery externo» en el cobro del cajero", () => {
  it("aparece SIEMPRE en el cajero, sin configurarla en formas de pago, junto a la opción normal", async () => {
    await abrirCobro();
    expect(screen.getByRole("button", { name: "Delivery externo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cobro normal" })).toBeTruthy(); // negocio sin CAI
    // y NO es una forma de pago de la lista
    expect(screen.queryByRole("option", { name: /Delivery externo/ })).toBeNull();
  });

  it("con facturación CAI activa la opción normal se llama «Factura CAI»", async () => {
    await sembrarFiscal(configFiscal());
    await abrirCobro();
    expect(await screen.findByRole("button", { name: "Factura CAI" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delivery externo" })).toBeTruthy();
  });

  it("aunque la forma de pago llegue guardada en la configuración, no sale en la lista", async () => {
    await abrirCobro(["efectivo", "delivery_externo"]);
    expect(screen.queryByRole("option", { name: /Delivery externo/ })).toBeNull();
  });

  it("al elegirla se esconde la forma de pago y lo fiscal, y avisa que no hay factura CAI", async () => {
    await sembrarFiscal(configFiscal());
    const { user } = await abrirCobro();
    expect(await screen.findByText("Factura con RTN")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Delivery externo" }));
    expect(screen.queryByText("Factura con RTN")).toBeNull();
    expect(screen.queryByLabelText("Forma de pago")).toBeNull();
    expect(screen.getByText(/no se emite factura CAI/)).toBeTruthy();
    expect(screen.getByText("Empresa de reparto / # de pedido (opcional)")).toBeTruthy();
  });

  it("cobra SIN factura aunque el CAI esté agotado, deja la orden pagada y ofrece imprimir el recibo (sin vista previa)", async () => {
    await sembrarFiscal(configFiscal(), [rangoCai({ siguiente: 101, hasta: 100, estado: "agotado" })]);
    await db.config.put({ clave: "sucursal", valor: { id: "S1", nombre: "Centro", agenteImpresionUrl: null } });
    const { user, onCobrado, ordenId } = await abrirCobro();

    await user.click(await screen.findByRole("button", { name: "Delivery externo" }));
    expect((screen.getByRole("button", { name: /Confirmar/ }) as HTMLButtonElement).disabled).toBe(false); // sin bloqueo por CAI
    await user.type(screen.getByRole("textbox", { name: /Empresa de reparto/ }), "PedidosYa #8841");
    await user.click(screen.getByRole("button", { name: /Confirmar/ }));

    expect(await screen.findByText("Cobro registrado")).toBeTruthy();
    expect(screen.getByText(/sin factura CAI/)).toBeTruthy();
    // sin vista previa: solo el botón para imprimir el recibo
    expect(await screen.findByRole("button", { name: /Imprimir recibo/ })).toBeTruthy();
    expect(screen.queryByText("RECIBO")).toBeNull();
    expect(screen.queryByText("NO ES DOCUMENTO FISCAL")).toBeNull();

    expect((await db.ordenes.get(ordenId))?.estado).toBe("pagada");
    expect(await db.documentos_fiscales.count()).toBe(0);
    expect(await db.pagos.toArray()).toMatchObject([{ forma_pago: "delivery_externo", monto: 230, referencia: "PedidosYa #8841" }]);
    expect(onCobrado).not.toHaveBeenCalled(); // se cierra recién con «Listo»

    await user.click(screen.getByRole("button", { name: "Listo" }));
    expect(onCobrado).toHaveBeenCalledWith(null);
  });

  it("sin impresoras configuradas ofrece imprimir con el navegador y elegir el ancho del papel", async () => {
    await db.config.put({ clave: "sucursal", valor: { id: "S1", nombre: "Centro", agenteImpresionUrl: null } });
    const { user } = await abrirCobro();
    await user.click(screen.getByRole("button", { name: "Delivery externo" }));
    await user.click(screen.getByRole("button", { name: /Confirmar/ }));

    expect(await screen.findByRole("button", { name: /Imprimir recibo/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Impresora de la sucursal/ })).toBeNull();
    expect(screen.getByRole("button", { name: "80 mm" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "58 mm" }));
    await waitFor(() => expect(window.localStorage.getItem("pedilo:impresion:ancho")).toBe("32"));
  });
});
