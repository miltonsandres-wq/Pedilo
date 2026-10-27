// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("@/lib/supabase/client", async () => ({ createClient: (await import("./supabaseSinRed")).clienteSinRed }));

import { db, type MesaLocal } from "@/lib/offline/db";
import { MapaMesas } from "@/components/pos/MapaMesas";
import { mesasDeZona, posicionInicial, tienePlano, zonasDeMesas } from "@/lib/pos/plano";
import { limpiarDb } from "./fixtures";

afterEach(cleanup);
beforeEach(async () => {
  await limpiarDb();
  push.mockReset();
});

const mesa = (id: string, nombre: string, extra: Partial<MesaLocal> = {}): MesaLocal => ({
  id, sucursal_id: "S1", nombre, capacidad: 4, zona: null, pos_x: null, pos_y: null, estado: "libre", activa: true, ...extra,
});

const montar = () => render(<MapaMesas sucursalId="S1" tenantId="T1" usuarioId="U1" rol="cajero" />);

describe("plano.ts", () => {
  it("hay plano solo si al menos dos mesas están en puntos distintos", () => {
    expect(tienePlano([])).toBe(false);
    expect(tienePlano([{ pos_x: null, pos_y: null }, { pos_x: null, pos_y: null }])).toBe(false);
    expect(tienePlano([{ pos_x: 10, pos_y: 10 }, { pos_x: 10, pos_y: 10 }])).toBe(false); // todas apiladas (creadas antes del plano)
    expect(tienePlano([{ pos_x: 10, pos_y: 10 }, { pos_x: 60, pos_y: 40 }])).toBe(true);
  });

  it("las zonas salen sin repetir, con «Salón» (sin zona) primero", () => {
    const ms = [{ zona: "Terraza" }, { zona: null }, { zona: "Bar" }, { zona: "Terraza" }, { zona: "  " }];
    expect(zonasDeMesas(ms)).toEqual(["Salón", "Bar", "Terraza"]);
    expect(mesasDeZona(ms, "Terraza")).toHaveLength(2);
    expect(mesasDeZona(ms, "Salón")).toHaveLength(2);
  });

  it("las mesas nuevas nacen en lugares distintos del plano", () => {
    const puntos = Array.from({ length: 16 }, (_, i) => posicionInicial(i)).map((p) => `${p.x}|${p.y}`);
    expect(new Set(puntos).size).toBe(16);
    for (let i = 0; i < 40; i++) {
      const p = posicionInicial(i);
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(100);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(100);
    }
  });
});

describe("las mesas del POS", () => {
  it("con mesas ubicadas por el admin dibuja el plano y cada mesa se puede tocar", async () => {
    await db.mesas.bulkAdd([mesa("M1", "Mesa 1", { pos_x: 20, pos_y: 20 }), mesa("M2", "Mesa 2", { pos_x: 70, pos_y: 60 })]);
    const user = userEvent.setup();
    montar();
    const plano = await screen.findByTestId("plano-salon");
    expect(plano.textContent).toContain("Mesa 1");
    expect(plano.textContent).toContain("Mesa 2");
    // quedan en el lugar que el admin les dio
    const m2 = screen.getByRole("button", { name: /Mesa 2/ });
    expect(m2.dataset.posX).toBe("70");
    expect(m2.dataset.posY).toBe("60");

    await user.click(m2);
    expect(await screen.findByText("Recibir cliente")).toBeTruthy();
  });

  it("sin ubicar las mesas (o todas amontonadas) cae a la cuadrícula de siempre", async () => {
    await db.mesas.bulkAdd([mesa("M1", "Mesa 1", { pos_x: 10, pos_y: 10 }), mesa("M2", "Mesa 2", { pos_x: 10, pos_y: 10 })]);
    montar();
    await screen.findByRole("button", { name: /Mesa 1/ });
    expect(screen.queryByTestId("plano-salon")).toBeNull();
    expect(screen.getByRole("button", { name: /Mesa 2/ })).toBeTruthy();
  });

  it("una mesa sin ubicar aparece aparte, debajo del plano", async () => {
    await db.mesas.bulkAdd([
      mesa("M1", "Mesa 1", { pos_x: 20, pos_y: 20 }),
      mesa("M2", "Mesa 2", { pos_x: 70, pos_y: 60 }),
      mesa("M3", "Mesa 3"),
    ]);
    montar();
    const plano = await screen.findByTestId("plano-salon");
    expect(plano.textContent).not.toContain("Mesa 3");
    expect(screen.getByText("Mesas sin ubicar en el plano")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Mesa 3/ })).toBeTruthy();
  });

  it("con varias zonas hay una pestaña por zona y cada una muestra solo sus mesas", async () => {
    await db.mesas.bulkAdd([
      mesa("M1", "Mesa 1", { zona: "Terraza", pos_x: 20, pos_y: 20 }),
      mesa("M2", "Mesa 2", { zona: "Terraza", pos_x: 70, pos_y: 60 }),
      mesa("M3", "Mesa 3", { pos_x: 30, pos_y: 30 }),
      mesa("M4", "Mesa 4", { pos_x: 60, pos_y: 70 }),
    ]);
    const user = userEvent.setup();
    montar();
    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Salón", "Terraza"]); // «Salón» (sin zona) primero
    expect(screen.queryByRole("button", { name: /Mesa 1/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Mesa 3/ })).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Terraza" }));
    expect(screen.getByRole("button", { name: /Mesa 1/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Mesa 3/ })).toBeNull();
  });

  it("con una sola zona no hay pestañas", async () => {
    await db.mesas.bulkAdd([mesa("M1", "Mesa 1"), mesa("M2", "Mesa 2")]);
    montar();
    await screen.findByRole("button", { name: /Mesa 1/ });
    expect(screen.queryByRole("tab")).toBeNull();
  });
});
