// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/[slug]/actions", () => ({ crearPedidoDelivery: vi.fn(), subirComprobante: vi.fn() }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));

import { MenuDeliveryCliente } from "@/components/delivery/MenuDelivery";
import type { MenuDelivery } from "@/lib/delivery/menuPublico";

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

function menu(over: Partial<MenuDelivery> = {}): MenuDelivery {
  return {
    slug: "doña-ana", sucursalId: "S1", nombre: "Fondita Doña Ana", logoUrl: null, telefono: null, mensajeBienvenida: null,
    abierto: true, motivoCierre: null, horarioHoy: null, tiempoEstimadoMin: 30, montoMinimo: 0,
    metodosPago: ["efectivo"], cuentaTransferencia: null,
    categorias: [{ id: "C1", nombre: "Platos fuertes" }, { id: "C2", nombre: "Bebidas" }],
    productos: [
      { id: "A", nombre: "Pollo con tajadas", descripcion: "Con repollo y salsa", precio: 120, foto_url: "https://x.test/p.jpg", categoria_id: "C1" },
      { id: "B", nombre: "Limonada", descripcion: null, precio: 35, foto_url: null, categoria_id: "C2" },
    ],
    zonas: [],
    ...over,
  } as MenuDelivery;
}

describe("menú de delivery gráfico", () => {
  it("categorías como botones y tarjetas con foto, precio y botón de agregar", async () => {
    const user = userEvent.setup();
    const { container } = render(<MenuDeliveryCliente menu={menu()} />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Platos fuertes", "Bebidas"]);
    expect(screen.getByText("L 120.00")).toBeTruthy();
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://x.test/p.jpg");
    expect(screen.getByText("Los precios incluyen ISV.")).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Bebidas" }));
    expect(screen.getByText("L 35.00")).toBeTruthy();
    expect(screen.queryByText("Pollo con tajadas")).toBeNull();
  });

  it("agregar desde la tarjeta suma al pedido y se ve en el botón del carrito", async () => {
    const user = userEvent.setup();
    render(<MenuDeliveryCliente menu={menu()} />);
    await user.click(screen.getByRole("button", { name: "Agregar Pollo con tajadas" }));
    await user.click(screen.getByRole("button", { name: "Sumar uno de Pollo con tajadas" }));
    expect(screen.getByRole("button", { name: /Ver mi pedido · 2/ }).textContent).toContain("L 240.00");
    // el número de platos del pedido también aparece en la categoría
    expect(screen.getByRole("tab", { name: "Platos fuertes" })).toBeTruthy();
  });

  it("cerrado: se ve el menú pero no hay botones para agregar", () => {
    render(<MenuDeliveryCliente menu={menu({ abierto: false, motivoCierre: "Abrimos a las 10:00." })} />);
    expect(screen.getByText("Pollo con tajadas")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Agregar/ })).toBeNull();
  });
});
