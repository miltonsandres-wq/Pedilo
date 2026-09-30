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

import { TutorialOnboarding } from "@/components/admin/TutorialOnboarding";
import { EVENTO_ABRIR_MENU, EVENTO_ABRIR_TUTORIAL } from "@/lib/tutorial/eventos";
import { PASOS_GUIA, PROGRESO_VACIO, calcularFase } from "@/lib/tutorial/pasos";

const T = "negocio-1";
const T2 = "negocio-2";

/** Elementos «de la interfaz» que el recorrido señala (en jsdom nada tiene tamaño, así que se lo damos). */
let montados: HTMLElement[] = [];
function montar(dataTour: string) {
  const el = document.createElement("div");
  el.setAttribute("data-tour", dataTour);
  document.body.appendChild(el);
  montados.push(el);
  return el;
}

beforeEach(() => {
  completarTutorial.mockReset();
  completarTutorial.mockResolvedValue({ ok: true });
  progresoTutorial.mockReset();
  progresoTutorial.mockResolvedValue({ ...PROGRESO_VACIO });
  pathname = "/admin";
  sessionStorage.clear();
  localStorage.clear();
  montados = [];
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute("data-tour")
      ? ({ top: 100, left: 40, width: 160, height: 36, right: 200, bottom: 136, x: 40, y: 100, toJSON() {} } as DOMRect)
      : ({ top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} } as DOMRect);
  });
});
afterEach(() => {
  cleanup();
  montados.forEach((el) => el.remove());
  vi.restoreAllMocks();
});

const guia = () => screen.queryByRole("complementary", { name: "Guía paso a paso" });
const bienvenida = () => screen.queryByRole("dialog", { name: "Bienvenida a Pedilo" });
const foco = () => screen.queryByTestId("foco-guia")?.getAttribute("data-foco") ?? null;

async function empezar(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /Empezar la guía/ }));
}

const irAlPaso = (id: string) => localStorage.setItem(`pedilo_tutorial_paso_${T}`, String(PASOS_GUIA.findIndex((p) => p.id === id)));

describe("calcularFase (qué señalar en cada momento)", () => {
  const personal = PASOS_GUIA.find((p) => p.id === "personal")!;
  const existe = (presentes: string[]) => (s: string) => presentes.includes(s);

  it("fuera de la pantalla del paso: señala el enlace del menú", () => {
    expect(calcularFase(personal, PROGRESO_VACIO, "/admin", existe([]))).toEqual({
      fase: "ir",
      selector: '[data-tour="nav-sucursales"]',
    });
  });
  it("en la pantalla pero con el formulario cerrado: señala el botón que lo abre", () => {
    expect(calcularFase(personal, PROGRESO_VACIO, "/admin/sucursales", existe([]))).toEqual({
      fase: "abrir",
      selector: '[data-tour="abrir-personal"]',
    });
  });
  it("con el formulario abierto: señala el formulario y espera", () => {
    expect(calcularFase(personal, PROGRESO_VACIO, "/admin/sucursales", existe(['[data-tour="form-personal"]']))).toEqual({
      fase: "llenar",
      selector: '[data-tour="form-personal"]',
    });
  });
  it("ya creado: hecho, sin señalar nada (aunque esté en otra pantalla)", () => {
    expect(calcularFase(personal, { ...PROGRESO_VACIO, personal: 1 }, "/admin", existe([]))).toEqual({ fase: "hecho", selector: null });
  });
  it("pasos informativos: señalan su formulario (si lo tienen) y no esperan nada", () => {
    const pagos = PASOS_GUIA.find((p) => p.id === "pagos")!;
    expect(calcularFase(pagos, PROGRESO_VACIO, "/admin/formas-pago", existe([]))).toEqual({ fase: "info", selector: '[data-tour="form-pagos"]' });
    const reportes = PASOS_GUIA.find((p) => p.id === "reportes")!;
    expect(calcularFase(reportes, PROGRESO_VACIO, "/admin", existe([])).fase).toBe("ir");
    expect(calcularFase(reportes, PROGRESO_VACIO, "/admin/reportes", existe([]))).toEqual({ fase: "info", selector: null });
  });
  it("una subruta cuenta como estar en la pantalla", () => {
    expect(calcularFase(PASOS_GUIA.find((p) => p.id === "categoria")!, PROGRESO_VACIO, "/admin/menu/importar", existe([])).fase).toBe("llenar");
  });
});

describe("estructura del recorrido", () => {
  it("cubre toda la app y cada paso de «crear algo» trae un ejemplo", () => {
    expect(PASOS_GUIA.map((p) => p.id)).toEqual([
      "personal", "categoria", "producto", "mesas", "pagos", "inv-categoria", "inv-item", "fiscal", "reportes",
    ]);
    for (const id of ["personal", "categoria", "producto", "mesas", "inv-categoria", "inv-item"]) {
      expect(PASOS_GUIA.find((p) => p.id === id)?.ejemplo?.length).toBeGreaterThan(0);
    }
  });
  it("cada paso se da por hecho con lo que corresponde en la base", () => {
    const prueba = (id: string, campo: keyof typeof PROGRESO_VACIO) => {
      const p = PASOS_GUIA.find((x) => x.id === id)!;
      return [p.hecho!(PROGRESO_VACIO), p.hecho!({ ...PROGRESO_VACIO, [campo]: 1 })];
    };
    expect(prueba("personal", "personal")).toEqual([false, true]);
    expect(prueba("categoria", "categorias")).toEqual([false, true]);
    expect(prueba("producto", "productos")).toEqual([false, true]);
    expect(prueba("mesas", "mesas")).toEqual([false, true]);
    expect(prueba("inv-categoria", "inventarioCategorias")).toEqual([false, true]);
    expect(prueba("inv-item", "inventarioItems")).toEqual([false, true]);
  });

  it("son SOLO pasos de configuración del administrador: ninguno lo saca del panel (ni al POS ni a cocina)", () => {
    for (const p of PASOS_GUIA) {
      if (p.ruta) expect(p.ruta.startsWith("/admin"), `${p.id}: ${p.ruta}`).toBe(true);
      expect(p.ruta ?? "").not.toMatch(/^\/(pos|cocina)/);
      expect(p.titulo.toLowerCase()).not.toMatch(/venta de prueba|pantalla de cocina/);
    }
    expect(PASOS_GUIA.some((p) => p.id === "pos" || p.id === "cocina")).toBe(false);
    // ni una sola pista apunta a los enlaces que salen del panel
    const texto = JSON.stringify(PASOS_GUIA);
    expect(texto).not.toContain("ir-pos");
    expect(texto).not.toContain("nav-cocina");
  });

  it("el último paso explica que los cajeros/meseros entran al POS con su usuario, sin mandar al admin allá", () => {
    const ultimo = PASOS_GUIA[PASOS_GUIA.length - 1];
    expect(ultimo.id).toBe("reportes");
    expect(ultimo.instrucciones.join(" ")).toMatch(/cajeros y meseros entran al POS con su usuario/);
  });
});

describe("recorrido guiado: resalta en pantalla y avanza solo", () => {
  it("al crear el negocio da la bienvenida y al empezar señala «Sucursales» en el menú", async () => {
    const user = userEvent.setup();
    montar("nav-sucursales");
    render(<TutorialOnboarding completado={false} tenantId={T} />);
    expect(await screen.findByText("¡Bienvenido a Pedilo!")).toBeTruthy();

    await empezar(user);
    expect(screen.getByText(/Crea a tu personal/)).toBeTruthy();
    expect(screen.getByText(/Haz clic en/).textContent).toContain("«Sucursales»");
    await waitFor(() => expect(foco()).toBe('[data-tour="nav-sucursales"]'));
  });

  it("sigue el recorrido en vivo: menú → botón «Agregar cajero o mesero» → formulario → hecho → siguiente paso", async () => {
    const user = userEvent.setup();
    montar("nav-sucursales");
    montar("nav-menu");
    const vista = render(<TutorialOnboarding completado={false} tenantId={T} />);
    await empezar(user);
    await waitFor(() => expect(foco()).toBe('[data-tour="nav-sucursales"]'));

    // 1) el dueño hace clic en Sucursales -> se señala el botón que abre el formulario
    pathname = "/admin/sucursales";
    montar("abrir-personal");
    vista.rerender(<TutorialOnboarding completado={false} tenantId={T} />);
    expect((await screen.findByText(/Toca/)).textContent).toContain("«Agregar cajero o mesero»");
    await waitFor(() => expect(foco()).toBe('[data-tour="abrir-personal"]'));

    // 2) abre el formulario -> se señala el formulario con el ejemplo
    montar("form-personal");
    expect(await screen.findByText("cajero1@minegocio.com")).toBeTruthy();
    await waitFor(() => expect(foco()).toBe('[data-tour="form-personal"]'));
    expect(screen.getByText(/Esperando a que lo hagas/)).toBeTruthy();

    // 3) crea el cajero -> se detecta solo y, tras una pausa, pasa al paso siguiente
    progresoTutorial.mockResolvedValue({ ...PROGRESO_VACIO, personal: 1 });
    expect(await screen.findByText(/Ya tienes personal registrado/, {}, { timeout: 6000 })).toBeTruthy();
    expect(foco()).toBeNull();
    expect(await screen.findByText(/Crea tu primera categoría/, {}, { timeout: 6000 })).toBeTruthy();

    // 4) y el siguiente paso arranca señalando el menú «Menú digital»
    await waitFor(() => expect(foco()).toBe('[data-tour="nav-menu"]'));
    expect(screen.getByText(/Haz clic en/).textContent).toContain("«Menú digital»");
  }, 25000);

  it("en móvil, si el enlace del menú no se ve, pide abrir el cajón del menú", async () => {
    const user = userEvent.setup();
    const abrirMenu = vi.fn();
    window.addEventListener(EVENTO_ABRIR_MENU, abrirMenu);
    render(<TutorialOnboarding completado={false} tenantId={T} />); // sin enlace en el DOM = menú cerrado
    await empezar(user);
    await waitFor(() => expect(abrirMenu).toHaveBeenCalled());
    window.removeEventListener(EVENTO_ABRIR_MENU, abrirMenu);
  });

  it("si lo señalado queda fuera de la vista, lo desplaza a la parte alta", async () => {
    const user = userEvent.setup();
    montar("nav-sucursales");
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute("data-tour")
        ? ({ top: 900, left: 40, width: 160, height: 36, right: 200, bottom: 936, x: 40, y: 900, toJSON() {} } as DOMRect)
        : ({ top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} } as DOMRect);
    });
    render(<TutorialOnboarding completado={false} tenantId={T} />);
    await empezar(user);
    await waitFor(() => expect(window.scrollTo).toHaveBeenCalled());
  });

  it("Saltar este paso y Anterior funcionan, y recuerda el paso al recargar sin repetir la bienvenida", async () => {
    const user = userEvent.setup();
    montar("nav-sucursales");
    montar("nav-menu");
    const { unmount } = render(<TutorialOnboarding completado={false} tenantId={T} />);
    await empezar(user);
    await user.click(await screen.findByRole("button", { name: "Saltar este paso" }));
    expect(screen.getByText(/Crea tu primera categoría/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Anterior" }));
    expect(screen.getByText(/Crea a tu personal/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Saltar este paso" }));
    unmount();

    render(<TutorialOnboarding completado={false} tenantId={T} />);
    expect(await screen.findByText(/Crea tu primera categoría/)).toBeTruthy();
    expect(bienvenida()).toBeNull();
  });

  it("el estado se guarda POR NEGOCIO: otro negocio nuevo en el mismo navegador empieza de cero", async () => {
    const user = userEvent.setup();
    montar("nav-sucursales");
    // el negocio 1 lo dejó a medias y luego pulsó «Más tarde»
    localStorage.setItem(`pedilo_tutorial_paso_${T}`, "3");
    sessionStorage.setItem(`pedilo_tutorial_omitido_${T}`, "1");

    render(<TutorialOnboarding completado={false} tenantId={T2} />);
    expect(await screen.findByText("¡Bienvenido a Pedilo!")).toBeTruthy(); // negocio 2: bienvenida, no el paso 4
    await empezar(user);
    expect(screen.getByText(/Crea a tu personal/)).toBeTruthy();
    expect(localStorage.getItem(`pedilo_tutorial_paso_${T}`)).toBe("3"); // no se pisa el del otro negocio
  });

  it("en el último paso aparece «Tutorial completado»: se guarda UNA vez y no vuelve a salir", async () => {
    irAlPaso("reportes");
    pathname = "/admin/reportes";
    const user = userEvent.setup();
    const { unmount } = render(<TutorialOnboarding completado={false} tenantId={T} />);
    expect(await screen.findByText(/Reportes y cierre del día/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Siguiente paso|Saltar este paso/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Tutorial completado" }));
    await waitFor(() => expect(guia()).toBeNull());
    expect(completarTutorial).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(`pedilo_tutorial_paso_${T}`)).toBeNull();
    unmount();

    // al recargar el panel, el servidor ya lo da por completado
    render(<TutorialOnboarding completado={true} tenantId={T} />);
    await act(async () => {});
    expect(guia()).toBeNull();
    expect(bienvenida()).toBeNull();
  });

  it("si no se pudo guardar avisa, sigue abierto y permite reintentar", async () => {
    completarTutorial.mockResolvedValueOnce({ ok: false });
    irAlPaso("reportes");
    pathname = "/admin/reportes";
    const user = userEvent.setup();
    render(<TutorialOnboarding completado={false} tenantId={T} />);
    await user.click(await screen.findByRole("button", { name: "Tutorial completado" }));
    expect(await screen.findByText(/No se pudo guardar/)).toBeTruthy();
    expect(guia()).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Tutorial completado" }));
    await waitFor(() => expect(guia()).toBeNull());
    expect(completarTutorial).toHaveBeenCalledTimes(2);
  });

  it("«Más tarde» y la X cierran solo en esta sesión y NO lo marcan como completado", async () => {
    const user = userEvent.setup();
    montar("nav-sucursales");
    const a = render(<TutorialOnboarding completado={false} tenantId={T} />);
    await user.click(await screen.findByRole("button", { name: "Más tarde" }));
    expect(bienvenida()).toBeNull();
    a.unmount();
    render(<TutorialOnboarding completado={false} tenantId={T} />);
    await act(async () => {});
    expect(bienvenida()).toBeNull(); // misma sesión: no molesta
    cleanup();

    sessionStorage.clear(); // sesión nueva: como no lo completó, vuelve a salir
    render(<TutorialOnboarding completado={false} tenantId={T} />);
    await empezar(user);
    await user.click(screen.getByRole("button", { name: "Cerrar tutorial" }));
    expect(guia()).toBeNull();
    expect(completarTutorial).not.toHaveBeenCalled();
  });

  it("NO estorba: la guía es una barra en el flujo de la página (no flota sobre botones) y el marco no oscurece ni bloquea clics", async () => {
    const user = userEvent.setup();
    montar("nav-sucursales");
    render(<TutorialOnboarding completado={false} tenantId={T} />);
    await empezar(user);
    const barra = await screen.findByRole("complementary", { name: "Guía paso a paso" });
    expect(barra.className).toContain("sticky");
    expect(barra.className).not.toContain("fixed");

    await waitFor(() => expect(foco()).not.toBeNull());
    const marco = screen.getByTestId("foco-guia") as HTMLElement;
    expect(marco.className).toContain("pointer-events-none"); // los clics pasan a la pantalla de abajo
    expect(marco.style.boxShadow).toBe(""); // sin velo oscuro sobre el resto
  });

  it("minimizada también queda en el flujo (una sola línea), sin flotar", async () => {
    const user = userEvent.setup();
    montar("nav-sucursales");
    render(<TutorialOnboarding completado={false} tenantId={T} />);
    await empezar(user);
    await user.click(await screen.findByRole("button", { name: "Minimizar guía" }));
    const barra = screen.getByTestId("barra-guia-minimizada");
    expect(barra.className).toContain("sticky");
    expect(barra.className).not.toContain("fixed");
  });

  it("se puede minimizar (sin resaltar nada) y volver a abrir en el mismo paso", async () => {
    const user = userEvent.setup();
    montar("nav-sucursales");
    render(<TutorialOnboarding completado={false} tenantId={T} />);
    await empezar(user);
    await waitFor(() => expect(foco()).not.toBeNull());

    await user.click(screen.getByRole("button", { name: "Minimizar guía" }));
    expect(guia()).toBeNull();
    expect(foco()).toBeNull();
    const pastilla = screen.getByRole("button", { name: "Abrir la guía" });
    expect(pastilla.textContent).toContain("paso 1/9");
    await user.click(pastilla);
    expect(screen.getByText(/Crea a tu personal/)).toBeTruthy();
  });

  it("«Ver tutorial» lo reabre desde el principio aunque ya esté completado; cerrarlo al final no guarda nada", async () => {
    const user = userEvent.setup();
    render(<TutorialOnboarding completado={true} tenantId={T} />);
    await act(async () => {});
    expect(guia()).toBeNull();

    await act(async () => {
      window.dispatchEvent(new Event(EVENTO_ABRIR_TUTORIAL));
    });
    expect(await screen.findByText(/Crea a tu personal/)).toBeTruthy();

    // salta al final y cierra
    irAlPaso("reportes");
    pathname = "/admin/reportes";
    cleanup();
    localStorage.setItem(`pedilo_tutorial_paso_${T}`, String(PASOS_GUIA.length - 1));
    render(<TutorialOnboarding completado={true} tenantId={T} />);
    await act(async () => {
      window.dispatchEvent(new Event(EVENTO_ABRIR_TUTORIAL));
    });
    for (let i = 0; i < PASOS_GUIA.length - 1; i++) {
      await user.click(await screen.findByRole("button", { name: /Siguiente paso|Saltar este paso/ }));
    }
    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(guia()).toBeNull();
    expect(completarTutorial).not.toHaveBeenCalled();
  }, 20000);
});
