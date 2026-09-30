// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const completarTutorial = vi.fn();
const progresoTutorial = vi.fn();
vi.mock("@/app/admin/tutorial/actions", () => ({
  completarTutorial: () => completarTutorial(),
  progresoTutorial: () => progresoTutorial(),
}));

let pathname = "/admin";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

import { EVENTO_ABRIR_TUTORIAL, TutorialOnboarding } from "@/components/admin/TutorialOnboarding";
import { PASOS_GUIA, PROGRESO_VACIO } from "@/lib/tutorial/pasos";

afterEach(cleanup);
beforeEach(() => {
  completarTutorial.mockReset();
  completarTutorial.mockResolvedValue({ ok: true });
  progresoTutorial.mockReset();
  progresoTutorial.mockResolvedValue({ ...PROGRESO_VACIO });
  pathname = "/admin";
  sessionStorage.clear();
  localStorage.clear();
});

const guia = () => screen.queryByRole("complementary", { name: "Guía paso a paso" });
const bienvenida = () => screen.queryByRole("dialog", { name: "Bienvenida a Pedilo" });

async function empezar(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /Empezar la guía/ }));
}

async function avanzarHasta(user: ReturnType<typeof userEvent.setup>, id: string) {
  const destino = PASOS_GUIA.findIndex((p) => p.id === id);
  for (let i = 0; i < destino; i++) {
    await user.click(screen.getByRole("button", { name: /Siguiente paso|Saltar este paso/ }));
  }
}

describe("guía interactiva: estructura de los pasos", () => {
  it("recorre la app real con ejemplo: personal, categoría, producto, mesas, pagos, inventario, POS, cocina, fiscal y reportes", () => {
    expect(PASOS_GUIA.map((p) => p.id)).toEqual([
      "personal", "categoria", "producto", "mesas", "pagos", "inventario", "pos", "cocina", "fiscal", "reportes",
    ]);
    expect(new Set(PASOS_GUIA.map((p) => p.ruta)).size).toBeGreaterThanOrEqual(8);
    for (const p of PASOS_GUIA) expect(p.instrucciones.length).toBeGreaterThan(0);
    // los pasos de «crear algo» traen un ejemplo para seguir
    for (const id of ["personal", "categoria", "producto", "mesas", "inventario"]) {
      expect(PASOS_GUIA.find((p) => p.id === id)?.ejemplo?.length).toBeGreaterThan(0);
    }
  });

  it("cada paso se da por hecho con lo que corresponde en la base", () => {
    const hecho = (id: string, campo: keyof typeof PROGRESO_VACIO) => {
      const p = PASOS_GUIA.find((x) => x.id === id)!;
      return [p.hecho!(PROGRESO_VACIO), p.hecho!({ ...PROGRESO_VACIO, [campo]: 1 })];
    };
    expect(hecho("personal", "personal")).toEqual([false, true]);
    expect(hecho("categoria", "categorias")).toEqual([false, true]);
    expect(hecho("producto", "productos")).toEqual([false, true]);
    expect(hecho("mesas", "mesas")).toEqual([false, true]);
    expect(hecho("inventario", "inventarioItems")).toEqual([false, true]);
    expect(hecho("pos", "ordenes")).toEqual([false, true]);
    // los informativos se avanzan a mano
    for (const id of ["pagos", "cocina", "fiscal", "reportes"]) expect(PASOS_GUIA.find((p) => p.id === id)?.hecho).toBeNull();
  });
});

describe("TutorialOnboarding (guía paso a paso)", () => {
  it("a un negocio nuevo le da la bienvenida y al empezar lo lleva al paso 1 con su ejemplo y el enlace a la pantalla", async () => {
    const user = userEvent.setup();
    render(<TutorialOnboarding completado={false} />);
    expect(await screen.findByText("¡Bienvenido a Pedilo!")).toBeTruthy();
    expect(guia()).toBeNull();

    await empezar(user);
    expect(bienvenida()).toBeNull();
    expect(screen.getByText("Guía · paso 1 de 10")).toBeTruthy();
    expect(screen.getByText("Crea a tu personal")).toBeTruthy();
    expect(screen.getByText("Cajero 1")).toBeTruthy(); // ejemplo
    expect(screen.getByText("cajero1@minegocio.com")).toBeTruthy();
    const enlace = screen.getByRole("link", { name: /Ir a Sucursales/ });
    expect(enlace.getAttribute("href")).toBe("/admin/sucursales");
  });

  it("si ya estás en la pantalla del paso, en vez del enlace te lo dice", async () => {
    const user = userEvent.setup();
    pathname = "/admin/sucursales";
    render(<TutorialOnboarding completado={false} />);
    await empezar(user);
    expect(screen.getByText(/Estás en la pantalla correcta: Sucursales/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Ir a Sucursales/ })).toBeNull();
  });

  it("detecta solo que creaste lo del paso: pasa de «Esperando…» a «hecho» y destaca «Siguiente paso»", async () => {
    const user = userEvent.setup();
    const vista = render(<TutorialOnboarding completado={false} />);
    await empezar(user);
    await avanzarHasta(user, "categoria");

    expect(screen.getByText("Crea tu primera categoría")).toBeTruthy();
    expect(await screen.findByText(/Esperando a que lo hagas/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Saltar este paso" })).toBeTruthy();

    // el dueño crea la categoría en /admin/menu y la guía lo nota al cambiar de pantalla
    progresoTutorial.mockResolvedValue({ ...PROGRESO_VACIO, categorias: 1 });
    pathname = "/admin/menu";
    vista.rerender(<TutorialOnboarding completado={false} />);

    expect(await screen.findByText("Categoría creada.")).toBeTruthy();
    expect(screen.queryByText(/Esperando a que lo hagas/)).toBeNull();
    expect(screen.getByRole("button", { name: "Siguiente paso" })).toBeTruthy();
    expect(screen.getByText(/Estás en la pantalla correcta: Menú digital/)).toBeTruthy();
  });

  it("también lo detecta por consulta periódica sin cambiar de pantalla", async () => {
    const user = userEvent.setup();
    render(<TutorialOnboarding completado={false} />);
    await empezar(user);
    await avanzarHasta(user, "mesas");
    expect(await screen.findByText(/Esperando a que lo hagas/)).toBeTruthy();

    progresoTutorial.mockResolvedValue({ ...PROGRESO_VACIO, mesas: 2 });
    expect(await screen.findByText("Mesa creada.", {}, { timeout: 7000 })).toBeTruthy();
  }, 15000);

  it("recuerda el paso: si recargas o vuelves del POS, sigue donde ibas y no repite la bienvenida", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<TutorialOnboarding completado={false} />);
    await empezar(user);
    await avanzarHasta(user, "producto");
    expect(screen.getByText("Crea tu primer producto")).toBeTruthy();
    expect(screen.getByText("Coca-Cola")).toBeTruthy();
    unmount();

    render(<TutorialOnboarding completado={false} />);
    expect(await screen.findByText("Crea tu primer producto")).toBeTruthy();
    expect(bienvenida()).toBeNull();
  });

  it("Anterior regresa; en el último paso aparece «Tutorial completado» y se guarda UNA vez", async () => {
    const user = userEvent.setup();
    render(<TutorialOnboarding completado={false} />);
    await empezar(user);
    await avanzarHasta(user, "reportes");
    expect(screen.getByText("Reportes y cierre del día")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Siguiente paso|Saltar este paso/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Anterior" }));
    expect(screen.getByText("Facturación fiscal (opcional)")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Siguiente paso" })); // fiscal -> reportes
    await user.click(screen.getByRole("button", { name: "Tutorial completado" }));

    await waitFor(() => expect(guia()).toBeNull());
    expect(completarTutorial).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("pedilo_tutorial_paso")).toBeNull(); // ya no hay nada que recordar
  });

  it("una vez completado no vuelve a aparecer al recargar", async () => {
    render(<TutorialOnboarding completado={true} />);
    await act(async () => {});
    expect(guia()).toBeNull();
    expect(bienvenida()).toBeNull();
    expect(progresoTutorial).not.toHaveBeenCalled();
  });

  it("si no se pudo guardar avisa, sigue abierto y permite reintentar", async () => {
    completarTutorial.mockResolvedValueOnce({ ok: false });
    const user = userEvent.setup();
    render(<TutorialOnboarding completado={false} />);
    await empezar(user);
    await avanzarHasta(user, "reportes");

    await user.click(screen.getByRole("button", { name: "Tutorial completado" }));
    expect(await screen.findByText(/No se pudo guardar/)).toBeTruthy();
    expect(guia()).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Tutorial completado" }));
    await waitFor(() => expect(guia()).toBeNull());
    expect(completarTutorial).toHaveBeenCalledTimes(2);
  });

  it("«Más tarde» y la X cierran solo en esta sesión y NO lo marcan como completado", async () => {
    const user = userEvent.setup();
    const a = render(<TutorialOnboarding completado={false} />);
    await user.click(await screen.findByRole("button", { name: "Más tarde" }));
    expect(bienvenida()).toBeNull();
    a.unmount();
    render(<TutorialOnboarding completado={false} />);
    await act(async () => {});
    expect(bienvenida()).toBeNull(); // misma sesión: no molesta
    expect(completarTutorial).not.toHaveBeenCalled();
    cleanup();

    sessionStorage.clear(); // sesión nueva: como no lo completó, vuelve a salir
    const user2 = userEvent.setup();
    render(<TutorialOnboarding completado={false} />);
    await empezar(user2);
    await user2.click(screen.getByRole("button", { name: "Cerrar tutorial" }));
    expect(guia()).toBeNull();
    expect(completarTutorial).not.toHaveBeenCalled();
  });

  it("se puede minimizar a una pastilla y volver a abrir en el mismo paso", async () => {
    const user = userEvent.setup();
    render(<TutorialOnboarding completado={false} />);
    await empezar(user);
    await avanzarHasta(user, "mesas");

    await user.click(screen.getByRole("button", { name: "Minimizar guía" }));
    expect(guia()).toBeNull();
    const pastilla = screen.getByRole("button", { name: "Abrir la guía" });
    expect(pastilla.textContent).toContain("paso 4/10");
    await user.click(pastilla);
    expect(screen.getByText("Crea tu primera mesa")).toBeTruthy();
  });

  it("«Ver tutorial» lo reabre desde el paso 1 aunque ya esté completado; cerrarlo al final no guarda nada", async () => {
    const user = userEvent.setup();
    render(<TutorialOnboarding completado={true} />);
    await act(async () => {});
    await act(async () => {
      window.dispatchEvent(new Event(EVENTO_ABRIR_TUTORIAL));
    });
    expect(await screen.findByText("Crea a tu personal")).toBeTruthy();

    await avanzarHasta(user, "reportes");
    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(guia()).toBeNull();
    expect(completarTutorial).not.toHaveBeenCalled();
  });
});
