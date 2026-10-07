// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("@/lib/supabase/client", async () => ({ createClient: (await import("./supabaseSinRed")).clienteSinRed }));
const imprimirDirecto = vi.fn();
vi.mock("@/lib/printing/imprimirDirecto", () => ({ imprimirDirecto: (...a: unknown[]) => imprimirDirecto(...a) }));

import { db } from "@/lib/offline/db";
import { MapaMesas } from "@/components/pos/MapaMesas";
import { DetalleMesa } from "@/components/pos/DetalleMesa";
import { configFiscal, limpiarDb, sembrarFiscal } from "./fixtures";

afterEach(cleanup);
beforeEach(async () => {
  await limpiarDb();
  push.mockReset();
  imprimirDirecto.mockReset();
  imprimirDirecto.mockResolvedValue({ ok: true });
  await db.mesas.add({ id: "M1", sucursal_id: "S1", nombre: "Mesa 1", capacidad: 4, zona: null, pos_x: null, pos_y: null, estado: "libre", activa: true });
});

const mapa = (rol: "cajero" | "mesero" | "admin") =>
  render(<MapaMesas sucursalId="S1" tenantId="T1" usuarioId="U1" rol={rol} />);

describe("el canal del pedido se elige al CREARLO", () => {
  it("el cajero ve Para llevar, Plataforma y Delivery; el mesero no", async () => {
    mapa("cajero");
    expect(await screen.findByRole("button", { name: /Para llevar/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Plataforma/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Delivery/ }).getAttribute("href")).toBe("/pos/delivery");
    cleanup();
    mapa("mesero");
    await screen.findByText("Mesa 1");
    expect(screen.queryByRole("button", { name: /Para llevar/ })).toBeNull();
  });

  it("un pedido para llevar se crea SIN mesa, con su canal, y abre su pantalla", async () => {
    const user = userEvent.setup();
    mapa("cajero");
    await user.click(await screen.findByRole("button", { name: /Para llevar/ }));
    await user.type(screen.getByLabelText(/Nombre del cliente/), "Carlos");
    await user.click(screen.getByRole("button", { name: "Crear pedido" }));

    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    const ordenes = await db.ordenes.toArray();
    expect(ordenes).toHaveLength(1);
    expect(ordenes[0]).toMatchObject({ canal: "para_llevar", mesa_id: null, cliente_nombre: "Carlos", estado: "abierta" });
    expect(push).toHaveBeenCalledWith(`/pos/orden/${ordenes[0].id}`);
    expect((await db.mesas.get("M1"))?.estado).toBe("libre"); // no ocupa ninguna mesa
  });

  it("un pedido de plataforma guarda la empresa / # de pedido", async () => {
    const user = userEvent.setup();
    mapa("admin");
    await user.click(await screen.findByRole("button", { name: /Plataforma/ }));
    await user.type(screen.getByLabelText(/Plataforma \/ # de pedido/), "PedidosYa #8841");
    await user.click(screen.getByRole("button", { name: "Crear pedido" }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect((await db.ordenes.toArray())[0]).toMatchObject({ canal: "plataforma", mesa_id: null, referencia_externa: "PedidosYa #8841" });
  });

  it("los pedidos abiertos sin mesa aparecen en el mapa para volver a ellos", async () => {
    await db.ordenes.add({
      id: "O9", sucursal_id: "S1", mesa_id: null, canal: "plataforma", referencia_externa: "Hugo #55", usuario_id: "U1", estado: "abierta",
      total: 150, cliente_nombre: null, personas: null, numero_dia: 4, lista_cocina: false, created_at: new Date().toISOString(),
      enviada_at: null, pagada_at: null, cancelada_at: null, motivo_cancelacion: null,
    });
    const user = userEvent.setup();
    mapa("cajero");
    const chip = await screen.findByRole("button", { name: /Plataforma #4/ });
    expect(chip.textContent).toContain("Hugo #55");
    await user.click(chip);
    expect(push).toHaveBeenCalledWith("/pos/orden/O9");
  });
});

describe("pedido sin mesa: tomar la orden y cobrar", () => {
  async function pedidoParaLlevar() {
    await db.ordenes.add({
      id: "O1", sucursal_id: "S1", mesa_id: null, canal: "para_llevar", usuario_id: "U1", estado: "abierta", total: 0,
      cliente_nombre: "Carlos", personas: null, numero_dia: 7, lista_cocina: false, created_at: new Date().toISOString(),
      enviada_at: null, pagada_at: null, cancelada_at: null, motivo_cancelacion: null,
    });
    await db.productos.add({ id: "P1", sucursal_id: "S1", categoria_id: null, nombre: "Baleada", descripcion: null, precio: 45, foto_url: null, disponible: true, tasa_isv: "15" });
  }

  it("se abre por su id, muestra el canal en vez de una mesa y deja agregar ítems", async () => {
    await pedidoParaLlevar();
    render(<DetalleMesa ordenId="O1" sucursalId="S1" usuarioId="U1" rol="cajero" />);
    expect(await screen.findByText("Para llevar")).toBeTruthy();
    expect(screen.getByText("Agregar ítem")).toBeTruthy();
    expect(await screen.findByRole("option", { name: /Baleada/ })).toBeTruthy();
  });

  it("al cobrarlo no toca ninguna mesa y queda pagado", async () => {
    await pedidoParaLlevar();
    await db.orden_items.add({
      id: "I1", orden_id: "O1", producto_id: "P1", nombre_producto: "Baleada", cantidad: 2, precio_unitario: 45, nota: null,
      impreso: true, origen_cliente: false, created_at: new Date().toISOString(),
    });
    await db.ordenes.update("O1", { total: 90 });
    await sembrarFiscal(configFiscal({ activa: false }));
    const user = userEvent.setup();
    render(<DetalleMesa ordenId="O1" sucursalId="S1" usuarioId="U1" rol="cajero" />);

    await user.click(await screen.findByRole("button", { name: /Cobrar/ }));
    await user.click(await screen.findByRole("button", { name: /Cobrar sin imprimir/ }));
    await waitFor(async () => expect((await db.ordenes.get("O1"))?.estado).toBe("pagada"));
    expect((await db.mesas.get("M1"))?.estado).toBe("libre");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/pos"));
  });
});
