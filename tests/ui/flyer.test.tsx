// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const guardar = vi.fn();
vi.mock("@/app/admin/mesas/actions", () => ({ guardarMensajeFlyer: (...a: unknown[]) => guardar(...a) }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

import { FlyersImprimibles } from "@/components/admin/FlyersImprimibles";
import { MensajeFlyerForm } from "@/components/admin/MensajeFlyerForm";
import type { DatosFlyer } from "@/components/admin/FlyerMesa";
import { MAX_MENSAJE_FLYER, MENSAJE_FLYER_POR_DEFECTO, mensajeParaFlyer, normalizarMensajeFlyer } from "@/lib/flyer/mensaje";

afterEach(() => {
  cleanup();
  guardar.mockReset();
});

const flyer = (mesa: string, over: Partial<DatosFlyer> = {}): DatosFlyer => ({
  restaurante: "Fondita Doña Ana", logoUrl: "https://x.test/logo.png", mensaje: "¡Escanea, elige y disfruta!",
  mesa, qrDataUrl: `data:image/png;base64,${mesa}`, detalle: "Col. Trejo · 9999-0000", ...over,
});

describe("mensaje del flyer", () => {
  it("usa el de la sucursal y, si está vacío, el de por defecto", () => {
    expect(mensajeParaFlyer("  Ven   a comer  ")).toBe("Ven a comer");
    expect(mensajeParaFlyer(null)).toBe(MENSAJE_FLYER_POR_DEFECTO);
    expect(mensajeParaFlyer("   ")).toBe(MENSAJE_FLYER_POR_DEFECTO);
  });

  it("al guardar limpia espacios, vacío = por defecto y rechaza lo muy largo", () => {
    expect(normalizarMensajeFlyer("  Hola   mundo ")).toEqual({ ok: true, mensaje: "Hola mundo" });
    expect(normalizarMensajeFlyer("   ")).toEqual({ ok: true, mensaje: null });
    expect(normalizarMensajeFlyer("x".repeat(MAX_MENSAJE_FLYER + 1))).toMatchObject({ ok: false });
  });
});

describe("flyers imprimibles", () => {
  it("muestra un flyer por mesa con el logo de fondo, el mensaje, el nombre de la mesa y su QR", () => {
    render(<FlyersImprimibles flyers={[flyer("Mesa 1"), flyer("Mesa 2")]} volverA="/admin/mesas" />);
    expect(screen.getAllByRole("heading", { level: 2, name: "¡Escanea, elige y disfruta!" })).toHaveLength(2);
    expect(screen.getByText("Mesa 1")).toBeTruthy();
    expect(screen.getByText("Mesa 2")).toBeTruthy();
    expect(screen.getAllByText("Fondita Doña Ana")).toHaveLength(2);
    expect(document.querySelectorAll("img.flyer-fondo")).toHaveLength(2);
    expect(document.querySelector("img.flyer-fondo")?.getAttribute("src")).toBe("https://x.test/logo.png");
    expect(screen.getByAltText("QR del menú de Mesa 1")).toBeTruthy();
  });

  it("sin logo no pone fondo", () => {
    render(<FlyersImprimibles flyers={[flyer("Mesa 1", { logoUrl: null })]} volverA="/admin/mesas" />);
    expect(document.querySelector("img.flyer-fondo")).toBeNull();
  });

  it("el botón imprime y se puede elegir A4 o A5", async () => {
    const print = vi.fn();
    window.print = print;
    const user = userEvent.setup();
    render(<FlyersImprimibles flyers={[flyer("Mesa 1"), flyer("Mesa 2")]} volverA="/admin/mesas" />);

    expect(document.querySelector("style")?.parentElement).toBeTruthy();
    expect(Array.from(document.querySelectorAll("style")).some((s) => s.textContent?.includes("size: A4 portrait"))).toBe(true);
    await user.click(screen.getByRole("button", { name: /Media hoja \(A5\)/ }));
    expect(Array.from(document.querySelectorAll("style")).some((s) => s.textContent?.includes("size: A5 portrait"))).toBe(true);
    expect(document.querySelector(".flyer-a5")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Imprimir 2 flyers/ }));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it("sin mesas avisa y no deja imprimir", () => {
    render(<FlyersImprimibles flyers={[]} volverA="/admin/mesas" />);
    expect(screen.getByText(/todavía no tiene mesas/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Imprimir/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("editar el mensaje de la sucursal", () => {
  it("muestra el mensaje guardado, el contador y permite elegir una idea con un toque", async () => {
    const user = userEvent.setup();
    render(<MensajeFlyerForm sucursalId="S1" mensajeInicial="Ven a comer rico" />);
    const campo = screen.getByLabelText(/Mensaje del flyer/) as HTMLTextAreaElement;
    expect(campo.value).toBe("Ven a comer rico");
    expect(screen.getByText(`16/${MAX_MENSAJE_FLYER}`)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "¿Hambre? Escanea y pide ya" }));
    expect(campo.value).toBe("¿Hambre? Escanea y pide ya");
  });

  it("sin mensaje guardado muestra el de por defecto como ejemplo", () => {
    render(<MensajeFlyerForm sucursalId="S1" mensajeInicial={null} />);
    expect((screen.getByLabelText(/Mensaje del flyer/) as HTMLTextAreaElement).placeholder).toBe(MENSAJE_FLYER_POR_DEFECTO);
  });
});
