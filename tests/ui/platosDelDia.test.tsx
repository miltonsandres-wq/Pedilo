// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

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
    const titulos = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titulos[0]).toMatch(/Platos del día/);
    expect(titulos).toContain("Antojitos");
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

    const grupoDia = await screen.findByRole("group", { name: /Platos del día/ });
    expect(grupoDia.textContent).toContain("Sopa de res");
    expect(grupoDia.textContent).not.toContain("Plato de ayer");
    const grupoMenu = screen.getByRole("group", { name: "Menú" });
    expect(grupoMenu.textContent).toContain("Coca-Cola");
    expect(grupoMenu.textContent).toContain("Plato de ayer"); // ayer ya es un producto normal
  });
});
