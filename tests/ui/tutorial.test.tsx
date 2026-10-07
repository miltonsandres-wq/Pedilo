// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const completarTutorial = vi.fn();
vi.mock("@/app/admin/tutorial/actions", () => ({
  completarTutorial: () => completarTutorial(),
}));

import { TutorialOnboarding } from "@/components/admin/TutorialOnboarding";
import { EVENTO_ABRIR_TUTORIAL } from "@/lib/tutorial/eventos";
import { PASOS_DEMO, estadoEnTic, ticsHastaResultado, TICS_CLIC, TICS_NAV, TICS_RESULTADO, MENU_ADMIN } from "@/lib/tutorial/demo";

const T = "negocio-1";

beforeEach(() => {
  completarTutorial.mockReset();
  completarTutorial.mockResolvedValue({ ok: true });
  sessionStorage.clear();
});
afterEach(() => cleanup());

/** Avanza la animación tic por tic (cada tic es un render distinto). */
async function avanzar(tics: number) {
  for (let i = 0; i < tics; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(70);
    });
  }
}

const bienvenida = () => screen.queryByRole("dialog", { name: "Bienvenida a Pedilo" });
const demo = () => screen.queryByRole("dialog", { name: "Demo del tutorial" });

describe("estadoEnTic (la animación de la demo)", () => {
  const paso = PASOS_DEMO[0];

  it("empieza con todo vacío y va escribiendo campo por campo", () => {
    const e0 = estadoEnTic(paso, 0);
    expect(e0.fase).toBe("nav"); // primero el cursor entra al menú
    expect(estadoEnTic(paso, TICS_NAV).fase).toBe("llenando");
    expect(e0.escritos.every((n) => n === 0)).toBe(true);
    const enMedio = estadoEnTic(paso, TICS_NAV + 8 + 4); // pausa del primer campo + 4 letras
    expect(enMedio.campo).toBe(0);
    expect(enMedio.escritos[0]).toBe(4);
  });

  it("después de llenar todo hace «clic» y luego muestra el resultado", () => {
    const t = ticsHastaResultado(paso) - TICS_CLIC;
    const e = estadoEnTic(paso, t);
    expect(e.fase).toBe("clic");
    expect(e.escritos).toEqual(paso.campos.map((c) => c.valor.length));
    expect(estadoEnTic(paso, t + TICS_CLIC).fase).toBe("resultado");
    expect(estadoEnTic(paso, t + TICS_CLIC).terminado).toBe(false);
    expect(estadoEnTic(paso, t + TICS_CLIC + TICS_RESULTADO).terminado).toBe(true);
  });

  it("cubre el panel, el delivery, el canal del pedido, el ticket sin factura y la impresión", () => {
    const ids = PASOS_DEMO.map((p) => p.id);
    for (const id of ["equipo", "categoria", "producto", "mesa", "delivery-config", "delivery-zona", "delivery-repartidor", "canal", "cobro", "pedido-delivery", "despacho", "externo", "impresion"]) {
      expect(ids).toContain(id);
    }
  });

  it("cada paso del panel apunta a una opción real del menú", () => {
    for (const p of PASOS_DEMO.filter((x) => x.app === "admin")) expect(MENU_ADMIN).toContain(p.item);
  });
});

describe("TutorialOnboarding (demo simulada)", () => {
  it("negocio nuevo: pregunta si quiere ver la demo", async () => {
    render(<TutorialOnboarding completado={false} tenantId={T} />);
    expect(await screen.findByText("¡Bienvenido a Pedilo!")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ver demo/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "No, gracias" })).toBeTruthy();
  });

  it("negocio con tutorial completado: no aparece", async () => {
    render(<TutorialOnboarding completado tenantId={T} />);
    await act(async () => {});
    expect(bienvenida()).toBeNull();
    expect(demo()).toBeNull();
  });

  it("«No, gracias» lo guarda como completado: no vuelve a preguntar", async () => {
    const user = userEvent.setup();
    render(<TutorialOnboarding completado={false} tenantId={T} />);
    await user.click(await screen.findByRole("button", { name: "No, gracias" }));
    expect(bienvenida()).toBeNull();
    expect(completarTutorial).toHaveBeenCalledTimes(1);
  });

  it("«Ver demo» abre la demo, que escribe sola en los campos y NO guarda nada", async () => {
    vi.useFakeTimers();
    try {
      render(<TutorialOnboarding completado={false} tenantId={T} />);
      await act(async () => {});
      fireEvent.click(screen.getByRole("button", { name: /Ver demo/ }));
      expect(demo()).toBeTruthy();
      expect(screen.getByText("Simulación")).toBeTruthy();
      expect(screen.getByTestId("menu-demo")).toBeTruthy(); // se ve el menú del panel real

      await avanzar(TICS_NAV + 14);
      expect(screen.getByTestId("campo-demo-0").textContent).toMatch(/^Caj/);

      const fin = ticsHastaResultado(PASOS_DEMO[0]) + 1;
      await avanzar(fin - 14);
      expect(screen.getByTestId("resultado-demo").textContent).toContain("Cajero 1");
      expect(completarTutorial).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("al terminar un paso pasa solo al siguiente", async () => {
    vi.useFakeTimers();
    try {
      render(<TutorialOnboarding completado={false} tenantId={T} />);
      await act(async () => {});
      fireEvent.click(screen.getByRole("button", { name: /Ver demo/ }));
      const total = ticsHastaResultado(PASOS_DEMO[0]) + TICS_RESULTADO + 5;
      await avanzar(total);
      expect(screen.getByText(/paso 2 de 13/)).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("Siguiente / Anterior / Pausa funcionan", async () => {
    const user = userEvent.setup();
    render(<TutorialOnboarding completado={false} tenantId={T} />);
    await user.click(await screen.findByRole("button", { name: /Ver demo/ }));
    await user.click(screen.getByRole("button", { name: /Siguiente/ }));
    expect(screen.getByText(/paso 2 de 13/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Anterior/ }));
    expect(screen.getByText(/paso 1 de 13/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Pausar demo" }));
    expect(screen.getByRole("button", { name: "Reproducir demo" })).toBeTruthy();
  });

  it("en el último paso «Entendido» lo guarda UNA vez como completado y cierra", async () => {
    const user = userEvent.setup();
    render(<TutorialOnboarding completado={false} tenantId={T} />);
    await user.click(await screen.findByRole("button", { name: /Ver demo/ }));
    for (let i = 0; i < PASOS_DEMO.length - 1; i++) await user.click(screen.getByRole("button", { name: /Siguiente/ }));
    expect(screen.queryByRole("button", { name: /Siguiente/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: /Entendido/ }));
    expect(completarTutorial).toHaveBeenCalledTimes(1);
    expect(demo()).toBeNull();
  });

  it("si no se puede guardar, avisa y no cierra", async () => {
    completarTutorial.mockResolvedValue({ ok: false });
    const user = userEvent.setup();
    render(<TutorialOnboarding completado={false} tenantId={T} />);
    await user.click(await screen.findByRole("button", { name: /Ver demo/ }));
    for (let i = 0; i < PASOS_DEMO.length - 1; i++) await user.click(screen.getByRole("button", { name: /Siguiente/ }));
    await user.click(screen.getByRole("button", { name: /Entendido/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("No se pudo guardar");
    expect(demo()).toBeTruthy();
  });

  it("la X cierra solo en esta sesión y NO lo marca como completado", async () => {
    const user = userEvent.setup();
    const a = render(<TutorialOnboarding completado={false} tenantId={T} />);
    await user.click(await screen.findByRole("button", { name: /Ver demo/ }));
    await user.click(screen.getByRole("button", { name: "Cerrar demo" }));
    expect(demo()).toBeNull();
    expect(completarTutorial).not.toHaveBeenCalled();
    a.unmount();
    render(<TutorialOnboarding completado={false} tenantId={T} />);
    await act(async () => {});
    expect(bienvenida()).toBeNull(); // misma sesión: no molesta
  });

  it("«Ver tutorial» del menú la abre aunque ya esté completado, y al final solo dice «Cerrar»", async () => {
    const user = userEvent.setup();
    render(<TutorialOnboarding completado tenantId={T} />);
    await act(async () => {});
    act(() => {
      window.dispatchEvent(new Event(EVENTO_ABRIR_TUTORIAL));
    });
    expect(demo()).toBeTruthy();
    for (let i = 0; i < PASOS_DEMO.length - 1; i++) await user.click(screen.getByRole("button", { name: /Siguiente/ }));
    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(demo()).toBeNull();
    expect(completarTutorial).not.toHaveBeenCalled();
  });
});
