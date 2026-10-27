// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/supabase/client", async () => ({ createClient: (await import("./supabaseSinRed")).clienteSinRed }));

import { db } from "@/lib/offline/db";
import { PantallaCocina } from "@/components/cocina/PantallaCocina";
import { ColumnasPorHora, BarrasHorizontales } from "@/components/admin/reportes/Graficas";
import { limpiarDb, sembrarOrden } from "./fixtures";

afterEach(cleanup);
beforeEach(limpiarDb);

const haceMin = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

describe("pantalla de cocina", () => {
  it("sin órdenes pendientes avisa que todo está al día", async () => {
    render(<PantallaCocina sucursalId="S1" />);
    expect(await screen.findByText("Todo al día")).toBeTruthy();
  });

  it("tarjeta grande con lugar, # de orden, cantidad, nota resaltada y el semáforo por minutos", async () => {
    await sembrarOrden([
      { nombre_producto: "Pollo con tajadas", cantidad: 3, precio_unitario: 120, nota: "sin cebolla" },
    ]);
    await db.ordenes.update("O1", { enviada_at: haceMin(12) });
    render(<PantallaCocina sucursalId="S1" />);

    expect(await screen.findByText("Mesa 1")).toBeTruthy();
    expect(screen.getByText("#1")).toBeTruthy();
    expect(screen.getByText("Pollo con tajadas")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("sin cebolla")).toBeTruthy();
    expect(screen.getByText("12 min")).toBeTruthy();
    expect(screen.getByText("¡Urgente!")).toBeTruthy(); // el color no va solo: lleva su palabra
    expect(document.querySelector('[data-urgencia="critico"]')).toBeTruthy();
  });

  it("una orden reciente sale «En tiempo» (verde) y una de 6 minutos «Atender» (ámbar)", async () => {
    await sembrarOrden();
    await db.ordenes.update("O1", { enviada_at: haceMin(1) });
    const { unmount } = render(<PantallaCocina sucursalId="S1" />);
    expect(await screen.findByText("En tiempo")).toBeTruthy();
    unmount();

    await db.ordenes.update("O1", { enviada_at: haceMin(6) });
    render(<PantallaCocina sucursalId="S1" />);
    expect(await screen.findByText("Atender")).toBeTruthy();
  });

  it("«Listo» marca la orden como lista y la tarjeta desaparece", async () => {
    await sembrarOrden();
    await db.ordenes.update("O1", { enviada_at: haceMin(2) });
    render(<PantallaCocina sucursalId="S1" />);
    await userEvent.click(await screen.findByRole("button", { name: /Listo/ }));
    await waitFor(async () => expect((await db.ordenes.get("O1"))?.lista_cocina).toBe(true));
    expect(screen.queryByText("Mesa 1")).toBeNull();
  });
});

describe("gráficas del reporte", () => {
  it("las barras muestran el nombre, el valor y el porcentaje como texto (también sirve de tabla)", () => {
    render(
      <BarrasHorizontales
        titulo="Por forma de pago"
        filas={[
          { nombre: "efectivo", valor: 300, detalle: "75 %" },
          { nombre: "tarjeta", valor: 100, detalle: "25 %" },
        ]}
      />
    );
    expect(screen.getByText("efectivo")).toBeTruthy();
    expect(screen.getByText("L. 300.00")).toBeTruthy();
    expect(screen.getByText("75 %")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Por forma de pago" })).toBeTruthy();
  });

  it("sin datos dice que no hay, no dibuja una gráfica vacía", () => {
    const { container } = render(<BarrasHorizontales titulo="X" filas={[]} vacio="Sin ventas ese día." />);
    expect(screen.getByText("Sin ventas ese día.")).toBeTruthy();
    expect(container.querySelector("li")).toBeNull();
    cleanup();
    render(<ColumnasPorHora datos={[]} />);
    expect(screen.getByText("Sin cobros ese día.")).toBeTruthy();
  });

  it("las columnas por hora dicen la hora pico y traen la tabla de datos", () => {
    render(<ColumnasPorHora datos={[{ hora: 12, total: 100 }, { hora: 13, total: 450.5 }, { hora: 14, total: 0 }]} />);
    expect(screen.getByRole("img", { name: /Hora con más ventas: 13:00, L\. 450\.50/ })).toBeTruthy();
    expect(screen.getByText("Ver como tabla")).toBeTruthy();
    expect(screen.getAllByText("13:00").length).toBeGreaterThan(0);
  });
});
