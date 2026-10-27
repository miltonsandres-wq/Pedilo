// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/supabase/client", async () => ({ createClient: (await import("./supabaseSinRed")).clienteSinRed }));
vi.mock("@/app/carta/[token]/actions", () => ({ enviarPedidoCliente: vi.fn() }));

import { db } from "@/lib/offline/db";
import { DetalleMesa } from "@/components/pos/DetalleMesa";
import { CartaCliente } from "@/components/carta/CartaCliente";
import { esPlatoDelDia, hoyHN } from "@/lib/menu/platosDelDia";
import { limpiarDb, sembrarOrden } from "./fixtures";

afterEach(cleanup);
beforeEach(limpiarDb);

describe("esPlatoDelDia", () => {
  it("solo es plato del día si la fecha marcada es la de hoy", () => {
    expect(esPlatoDelDia(hoyHN())).toBe(true);
    expect(esPlatoDelDia("2000-01-01")).toBe(false); // ya pasó: se quita solo
    expect(esPlatoDelDia(null)).toBe(false);
    expect(esPlatoDelDia(undefined)).toBe(false);
    expect(esPlatoDelDia("2026-10-07T00:00:00+00:00", "2026-10-07")).toBe(true);
  });
});

describe("carta del QR", () => {
  const productos = [
    { id: "A", nombre: "Baleada", descripcion: null, precio: 45, foto_url: null, categoria_id: "C1" },
    { id: "B", nombre: "Pollo con tajadas", descripcion: null, precio: 120, foto_url: null, categoria_id: "C1", plato_dia: true },
  ];

  it("muestra la sección «Platos del día» primero, con solo los de hoy", () => {
    render(<CartaCliente token="T" categorias={[{ id: "C1", nombre: "Antojitos" }]} productos={productos} />);
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs[0]).toMatch(/Platos del día/);
    expect(tabs).toContain("Antojitos");
    // los platos del día de hoy ya salen abiertos
    expect(screen.getByRole("heading", { level: 2 }).textContent).toMatch(/Platos del día/);
    expect(screen.getByText("Pollo con tajadas")).toBeTruthy();
  });

  it("muestra el precio de cada platillo y avisa que incluye ISV", async () => {
    const user = userEvent.setup();
    render(<CartaCliente token="T" categorias={[{ id: "C1", nombre: "Antojitos" }]} productos={productos} />);
    expect(screen.getByText("L 120.00")).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Antojitos" }));
    expect(screen.getByText("L 45.00")).toBeTruthy();
    expect(screen.getByText("Los precios incluyen ISV.")).toBeTruthy();
  });

  it("las categorías son botones: al elegir una salen solo sus platos, en tarjetas con foto o su marcador", async () => {
    const user = userEvent.setup();
    const menu = [
      { id: "A", nombre: "Baleada", descripcion: "Con queso y frijoles", precio: 45, foto_url: "https://x.test/b.jpg", categoria_id: "C1" },
      { id: "B", nombre: "Coca-Cola", descripcion: null, precio: 30, foto_url: null, categoria_id: "C2" },
      { id: "C", nombre: "Sopa suelta", descripcion: null, precio: 80, foto_url: null, categoria_id: null },
    ];
    const { container } = render(
      <CartaCliente token="T" categorias={[{ id: "C1", nombre: "Antojitos" }, { id: "C2", nombre: "Bebidas" }]} productos={menu} />
    );
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Antojitos", "Bebidas", "Más"]);
    expect(screen.getByRole("tab", { name: "Antojitos" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Baleada")).toBeTruthy();
    expect(screen.queryByText("Coca-Cola")).toBeNull();
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://x.test/b.jpg");

    await user.click(screen.getByRole("tab", { name: "Bebidas" }));
    expect(screen.getByText("Coca-Cola")).toBeTruthy();
    expect(screen.queryByText("Baleada")).toBeNull();
    expect(container.querySelector("img")).toBeNull(); // sin foto: marcador, no imagen rota

    await user.click(screen.getByRole("tab", { name: "Más" })); // sin categoría
    expect(screen.getByText("Sopa suelta")).toBeTruthy();
  });

  it("el pedido muestra el precio de cada línea y el total estimado", async () => {
    const user = userEvent.setup();
    render(<CartaCliente token="T" categorias={[{ id: "C1", nombre: "Antojitos" }]} productos={[productos[0]]} />);
    await user.click(screen.getByRole("button", { name: "Agregar Baleada" }));
    await user.click(screen.getByRole("button", { name: "Sumar uno de Baleada" })); // el contador sobre la tarjeta
    expect(screen.getByLabelText("2 de Baleada")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Ver mi pedido/ }));
    expect(screen.getByText("Total estimado")).toBeTruthy();
    expect(screen.getAllByText("L 90.00").length).toBeGreaterThan(0); // 2 × 45
  });

  it("sin platos del día no aparece la sección", () => {
    render(<CartaCliente token="T" categorias={[{ id: "C1", nombre: "Antojitos" }]} productos={[productos[0]]} />);
    expect(screen.queryByText(/Platos del día/)).toBeNull();
  });
});

describe("POS: agregar ítem", () => {
  it("los platos del día de hoy salen primero en su propio grupo", async () => {
    const { mesaId } = await sembrarOrden();
    const base = { sucursal_id: "S1", categoria_id: null, disponible: true, tasa_isv: "15", descripcion: null, foto_url: null };
    await db.productos.bulkAdd([
      { ...base, id: "P1", nombre: "Coca-Cola", precio: 30 },
      { ...base, id: "P2", nombre: "Sopa de res", precio: 110, plato_dia_fecha: hoyHN() },
      { ...base, id: "P3", nombre: "Plato de ayer", precio: 99, plato_dia_fecha: "2000-01-01" },
    ]);
    render(<DetalleMesa mesaId={mesaId} sucursalId="S1" usuarioId="U1" rol="cajero" />);

    await userEvent.click(await screen.findByRole("button", { name: /^Agregar ítem$/ }));
    // los platos del día de hoy son la primera categoría y ya salen abiertos
    expect(screen.getAllByRole("tab")[0].textContent).toMatch(/Platos del día/);
    expect(await screen.findByRole("button", { name: /Agregar Sopa de res/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Agregar Plato de ayer/ })).toBeNull();
    // ayer ya es un producto normal: sale en «Otros» (sin categoría)
    await userEvent.click(screen.getByRole("tab", { name: "Otros" }));
    expect(screen.getByRole("button", { name: /Agregar Coca-Cola/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Agregar Plato de ayer/ })).toBeTruthy();
  });
});
