// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const registrarNegocio = vi.fn();
vi.mock("@/app/registro/actions", () => ({
  registrarNegocio: (...a: unknown[]) => registrarNegocio(...a),
}));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

import RegistroPage from "@/app/registro/page";
import {
  mensajeErrorAuth,
  validarConfirmacion,
  validarCorreo,
  validarPassword,
  validarSucursales,
  validarTelefono,
} from "@/lib/registro/validaciones";

afterEach(() => {
  cleanup();
  registrarNegocio.mockReset();
});

describe("validaciones del registro", () => {
  it("correo: avisa qué falta", () => {
    expect(validarCorreo("")).toMatch(/Escribe/);
    expect(validarCorreo("maria.negocio.com")).toMatch(/@/);
    expect(validarCorreo("maria@negocio")).toMatch(/válido/);
    expect(validarCorreo("maria @negocio.com")).toMatch(/espacios/);
    expect(validarCorreo("maria@negocio.com")).toBeUndefined();
  });

  it("contraseña: mínimo 8, máximo 72 y confirmación igual", () => {
    expect(validarPassword("abc")).toMatch(/8 caracteres/);
    expect(validarPassword("a".repeat(73))).toMatch(/larga/);
    expect(validarPassword("Clave2026")).toBeUndefined();
    expect(validarConfirmacion("Clave2026", "Clave2025")).toMatch(/no coinciden/);
    expect(validarConfirmacion("Clave2026", "Clave2026")).toBeUndefined();
  });

  it("teléfono es opcional pero, si se escribe, debe ser un número", () => {
    expect(validarTelefono("")).toBeUndefined();
    expect(validarTelefono("9999-0000")).toBeUndefined();
    expect(validarTelefono("abc")).toBeDefined();
    expect(validarTelefono("123")).toBeDefined();
  });

  it("sucursales: nombre obligatorio y sin repetir", () => {
    const v = validarSucursales([
      { nombre: "Centro", telefono: "", direccion: "" },
      { nombre: "centro", telefono: "", direccion: "" },
      { nombre: "", telefono: "", direccion: "" },
    ]);
    expect(v.porSucursal[0].nombre).toBeUndefined();
    expect(v.porSucursal[1].nombre).toMatch(/Ya usaste/);
    expect(v.porSucursal[2].nombre).toMatch(/Escribe/);
  });

  it("errores de Supabase Auth: mensajes claros (incluye el texto nuevo «already been registered»)", () => {
    expect(mensajeErrorAuth({ code: "email_exists" })).toMatch(/Ya existe una cuenta/);
    expect(mensajeErrorAuth({ message: "A user with this email address has already been registered" })).toMatch(/Ya existe una cuenta/);
    expect(mensajeErrorAuth({ code: "weak_password" })).toMatch(/débil/);
    expect(mensajeErrorAuth({ status: 429 })).toMatch(/Espera/);
    expect(mensajeErrorAuth(null)).toMatch(/No se pudo crear/);
  });
});

describe("pantalla de registro: revisa cada campo antes de seguir", () => {
  it("no pasa al paso 2 con datos malos: marca cada campo y deja el cursor en el primero", async () => {
    const user = userEvent.setup();
    render(<RegistroPage />);
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByText(/Paso 1 de 2/)).toBeTruthy();
    expect(screen.getByText("Escribe tu nombre.")).toBeTruthy();
    expect(screen.getByText("Escribe tu correo.")).toBeTruthy();
    expect(screen.getByText("Escribe una contraseña.")).toBeTruthy();
    expect(document.activeElement?.id).toBe("reg-nombreAdmin");
  });

  it("avisa el error de un campo al salir de él, sin esperar al botón", async () => {
    const user = userEvent.setup();
    render(<RegistroPage />);
    await user.type(screen.getByLabelText("Correo"), "maria.negocio.com");
    expect(screen.queryByText(/Falta el/)).toBeNull(); // todavía escribiendo
    await user.tab();
    expect(screen.getByText(/Falta el «@»/)).toBeTruthy();
    expect(screen.getByLabelText("Correo").getAttribute("aria-invalid")).toBe("true");
  });

  it("contraseñas distintas: lo dice y no avanza; con todo bien pasa al paso 2", async () => {
    const user = userEvent.setup();
    render(<RegistroPage />);
    await user.type(screen.getByLabelText("Tu nombre"), "María Rodríguez");
    await user.type(screen.getByLabelText("Correo"), "maria@negocio.com");
    await user.type(screen.getByLabelText("Contraseña"), "Clave2026");
    await user.type(screen.getByLabelText("Confirmar contraseña"), "Clave2025");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByText("Las contraseñas no coinciden.")).toBeTruthy();
    expect(screen.getByText(/Paso 1 de 2/)).toBeTruthy();

    await user.clear(screen.getByLabelText("Confirmar contraseña"));
    await user.type(screen.getByLabelText("Confirmar contraseña"), "Clave2026");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByText(/Paso 2 de 2/)).toBeTruthy();
  });

  it("paso 2: no crea la cuenta sin nombre de sucursal ni con teléfono inválido", async () => {
    const user = userEvent.setup();
    render(<RegistroPage />);
    await user.type(screen.getByLabelText("Tu nombre"), "María Rodríguez");
    await user.type(screen.getByLabelText("Correo"), "maria@negocio.com");
    await user.type(screen.getByLabelText("Contraseña"), "Clave2026");
    await user.type(screen.getByLabelText("Confirmar contraseña"), "Clave2026");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await user.type(screen.getByLabelText(/Teléfono/), "abc");
    await user.click(screen.getByRole("button", { name: "Crear mi cuenta" }));
    expect(screen.getByText("Escribe el nombre de la sucursal.")).toBeTruthy();
    expect(screen.getByText(/Solo números/)).toBeTruthy();
    expect(registrarNegocio).not.toHaveBeenCalled();
  });

  it("se puede ver y ocultar la contraseña", async () => {
    const user = userEvent.setup();
    render(<RegistroPage />);
    const campo = screen.getByLabelText("Contraseña") as HTMLInputElement;
    expect(campo.type).toBe("password");
    await user.click(screen.getAllByRole("button", { name: "Mostrar contraseña" })[0]);
    expect(campo.type).toBe("text");
  });
});
