// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/supabase/client", async () => ({ createClient: (await import("./supabaseSinRed")).clienteSinRed }));

import { db } from "@/lib/offline/db";
import { DetalleMesa } from "@/components/pos/DetalleMesa";
import { limpiarDb, sembrarOrden } from "./fixtures";

afterEach(cleanup);
beforeEach(limpiarDb);

async function montar(rol: "cajero" | "mesero") {
  const { mesaId } = await sembrarOrden();
  await db.productos.add({
    id: "P1", sucursal_id: "S1", nombre: "Coca-Cola", precio: 30, disponible: true, categoria_id: "C1", tasa_isv: "15",
  } as never);
  await db.categorias.add({ id: "C1", nombre: "Bebidas", orden: 1 });
  render(<DetalleMesa mesaId={mesaId} sucursalId="S1" usuarioId="U1" rol={rol} />);
  await screen.findByText("Comanda");
}

describe("el cajero también toma la orden", () => {
  it("puede agregar ítems, enviar a cocina y cobrar", async () => {
    await montar("cajero");
    expect(screen.getByText("Agregar ítem")).toBeTruthy();
    // primero salen las categorías; el producto aparece al tocar su categoría
    await userEvent.click(await screen.findByRole("button", { name: /^Agregar ítem$/ }));
    expect(await screen.findByRole("tab", { name: "Bebidas" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: /Agregar Coca-Cola/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Enviar a cocina/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Cobrar/ })).toBeTruthy();
    expect(screen.queryByText(/Aquí solo cobras/)).toBeNull();
  });

  it("el mesero sigue pudiendo tomar el pedido pero no cobra", async () => {
    await montar("mesero");
    expect(screen.getByText("Agregar ítem")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Enviar a cocina/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Cobrar/ })).toBeNull();
  });
});
