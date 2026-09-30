// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const completarTutorial = vi.fn();
vi.mock("@/app/admin/tutorial/actions", () => ({ completarTutorial: () => completarTutorial() }));

import { EVENTO_ABRIR_TUTORIAL, PASOS, TutorialOnboarding } from "@/components/admin/TutorialOnboarding";

afterEach(cleanup);
beforeEach(() => {
  completarTutorial.mockReset();
  completarTutorial.mockResolvedValue({ ok: true });
  sessionStorage.clear();
});

const dialogo = () => screen.queryByRole("dialog", { name: "Tutorial de bienvenida" });

async function irAlUltimoPaso(user: ReturnType<typeof userEvent.setup>) {
  for (let i = 0; i < PASOS.length - 1; i++) await user.click(screen.getByRole("button", { name: "Siguiente" }));
}

describe("TutorialOnboarding", () => {
  it("a un negocio nuevo le muestra la bienvenida (paso 1 de 10) sin botón Anterior", async () => {
    render(<TutorialOnboarding completado={false} />);
    expect(await screen.findByRole("dialog", { name: "Tutorial de bienvenida" })).toBeTruthy();
    expect(screen.getByText("¡Bienvenido a Pedilo!")).toBeTruthy();
    expect(screen.getByText(`Paso 1 de ${PASOS.length}`)).toBeTruthy();
    expect(PASOS).toHaveLength(10);
    expect(screen.queryByRole("button", { name: "Anterior" })).toBeNull();
  });

  it("navega por todos los pasos hacia adelante y hacia atrás", async () => {
    const user = userEvent.setup();
    render(<TutorialOnboarding completado={false} />);
    await user.click(await screen.findByRole("button", { name: "Siguiente" }));
    expect(screen.getByText("1. Sucursales y personal")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getByText("2. Menú digital")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Anterior" }));
    expect(screen.getByText("1. Sucursales y personal")).toBeTruthy();
  });

  it("recorre la app completa: cada paso tiene título y contenido", async () => {
    const user = userEvent.setup();
    render(<TutorialOnboarding completado={false} />);
    for (let i = 0; i < PASOS.length; i++) {
      expect(await screen.findByText(PASOS[i].titulo)).toBeTruthy();
      expect(screen.getByText(`Paso ${i + 1} de ${PASOS.length}`)).toBeTruthy();
      if (i < PASOS.length - 1) await user.click(screen.getByRole("button", { name: "Siguiente" }));
    }
    const titulos = PASOS.map((p) => p.titulo).join(" | ");
    for (const seccion of ["Sucursales", "Menú digital", "Inventario", "Mesas", "Formas de pago", "POS", "cocina", "fiscal", "Reportes"]) {
      expect(titulos.toLowerCase()).toContain(seccion.toLowerCase());
    }
  });

  it("solo en el último paso aparece «Tutorial completado»; al tocarlo se guarda UNA vez y se cierra", async () => {
    const user = userEvent.setup();
    render(<TutorialOnboarding completado={false} />);
    await screen.findByRole("dialog");
    expect(screen.queryByRole("button", { name: "Tutorial completado" })).toBeNull();

    await irAlUltimoPaso(user);
    await user.click(screen.getByRole("button", { name: "Tutorial completado" }));

    await waitFor(() => expect(dialogo()).toBeNull());
    expect(completarTutorial).toHaveBeenCalledTimes(1);
  });

  it("una vez completado, al volver a cargar el panel no aparece más", async () => {
    const { unmount } = render(<TutorialOnboarding completado={true} />);
    await act(async () => {});
    expect(dialogo()).toBeNull();
    unmount();
    render(<TutorialOnboarding completado={true} />);
    await act(async () => {});
    expect(dialogo()).toBeNull();
    expect(completarTutorial).not.toHaveBeenCalled();
  });

  it("si no se pudo guardar, avisa, sigue abierto y permite reintentar", async () => {
    completarTutorial.mockResolvedValueOnce({ ok: false });
    const user = userEvent.setup();
    render(<TutorialOnboarding completado={false} />);
    await screen.findByRole("dialog");
    await irAlUltimoPaso(user);

    await user.click(screen.getByRole("button", { name: "Tutorial completado" }));
    expect(await screen.findByText(/No se pudo guardar/)).toBeTruthy();
    expect(dialogo()).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Tutorial completado" }));
    await waitFor(() => expect(dialogo()).toBeNull());
    expect(completarTutorial).toHaveBeenCalledTimes(2);
  });

  it("«Saltar por ahora» lo cierra en esta sesión pero NO lo marca como completado", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<TutorialOnboarding completado={false} />);
    await user.click(await screen.findByRole("button", { name: "Saltar por ahora" }));
    expect(dialogo()).toBeNull();
    expect(completarTutorial).not.toHaveBeenCalled();

    // misma sesión del navegador: no vuelve a molestar al navegar
    unmount();
    render(<TutorialOnboarding completado={false} />);
    await act(async () => {});
    expect(dialogo()).toBeNull();

    // sesión nueva: como no lo completó, vuelve a salir
    sessionStorage.clear();
    cleanup();
    render(<TutorialOnboarding completado={false} />);
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("la X también cierra sin marcarlo como completado", async () => {
    const user = userEvent.setup();
    render(<TutorialOnboarding completado={false} />);
    await user.click(await screen.findByRole("button", { name: "Cerrar tutorial" }));
    expect(dialogo()).toBeNull();
    expect(completarTutorial).not.toHaveBeenCalled();
  });

  it("«Ver tutorial» lo reabre desde el principio aunque ya esté completado, y cerrarlo no vuelve a guardar nada", async () => {
    const user = userEvent.setup();
    render(<TutorialOnboarding completado={true} />);
    await act(async () => {});
    expect(dialogo()).toBeNull();

    await act(async () => {
      window.dispatchEvent(new Event(EVENTO_ABRIR_TUTORIAL));
    });
    expect(await screen.findByText("¡Bienvenido a Pedilo!")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Saltar por ahora" })).toBeNull();

    await irAlUltimoPaso(user);
    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(dialogo()).toBeNull();
    expect(completarTutorial).not.toHaveBeenCalled();
  });
});
