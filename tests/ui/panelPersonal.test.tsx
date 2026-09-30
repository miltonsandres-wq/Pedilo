// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const replace = vi.fn();
const refresh = vi.fn();
let busqueda = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh, push: vi.fn() }),
  useSearchParams: () => busqueda,
}));

const signOut = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { signOut } }) }));
vi.mock("@/app/login/actions", () => ({ iniciarSesion: vi.fn() }));

import { AbrirPanelPersonal } from "@/components/admin/AbrirPanelPersonal";
import LoginPage from "@/app/login/page";
import { rolDeLogin, urlLoginPersonal } from "@/lib/auth/enlaces";

afterEach(cleanup);
beforeEach(() => {
  replace.mockReset();
  refresh.mockReset();
  signOut.mockReset();
  signOut.mockResolvedValue({});
  busqueda = new URLSearchParams();
});

describe("enlaces del login de personal", () => {
  it("arma la ruta con el rol y, si hay, el correo codificado", () => {
    expect(urlLoginPersonal("cajero")).toBe("/login?rol=cajero");
    expect(urlLoginPersonal("mesero", "ana+1@negocio.com")).toBe("/login?rol=mesero&email=ana%2B1%40negocio.com");
  });
  it("solo acepta cajero o mesero", () => {
    expect(rolDeLogin("cajero")).toBe("cajero");
    expect(rolDeLogin("mesero")).toBe("mesero");
    expect(rolDeLogin("admin")).toBeNull();
    expect(rolDeLogin("<script>")).toBeNull();
    expect(rolDeLogin(null)).toBeNull();
  });
});

describe("AbrirPanelPersonal", () => {
  it("«Abrir panel de cajero» cierra la sesión del dueño y lleva al login del cajero", async () => {
    const user = userEvent.setup();
    render(<AbrirPanelPersonal rol="cajero" />);
    await user.click(screen.getByRole("button", { name: "Abrir panel de cajero" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login?rol=cajero"));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signOut.mock.invocationCallOrder[0]).toBeLessThan(replace.mock.invocationCallOrder[0]); // primero sale, luego navega
    expect(refresh).toHaveBeenCalled();
  });

  it("para un mesero dice «mesero» y prellena su correo", async () => {
    const user = userEvent.setup();
    render(<AbrirPanelPersonal rol="mesero" email="mesero1@negocio.com" />);
    await user.click(screen.getByRole("button", { name: "Abrir panel de mesero" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login?rol=mesero&email=mesero1%40negocio.com"));
  });

  it("«Copiar enlace» copia la dirección completa del login para mandarla a la persona, SIN cerrar la sesión del dueño", async () => {
    const user = userEvent.setup();
    const escribir = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText: escribir }, configurable: true });
    render(<AbrirPanelPersonal rol="cajero" />);
    await user.click(screen.getByRole("button", { name: /Copiar enlace/ }));
    expect(escribir).toHaveBeenCalledWith(`${window.location.origin}/login?rol=cajero`);
    expect(await screen.findByText("Enlace copiado")).toBeTruthy();
    expect(signOut).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("la variante del encabezado no muestra el botón de copiar", () => {
    render(<AbrirPanelPersonal rol="mesero" compacto soloAbrir />);
    expect(screen.getByRole("button", { name: "Abrir panel de mesero" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Copiar enlace/ })).toBeNull();
  });
});

describe("login según el enlace", () => {
  it("sin parámetros: el login normal", () => {
    render(<LoginPage />);
    expect(screen.getByRole("heading", { name: "Bienvenido de nuevo" })).toBeTruthy();
  });

  it("?rol=cajero: «Panel de cajero» y el correo ya escrito; después del login entra por el inicio (cada rol va a su pantalla)", () => {
    busqueda = new URLSearchParams("rol=cajero&email=cajero1%40negocio.com");
    render(<LoginPage />);
    expect(screen.getByRole("heading", { name: "Panel de cajero" })).toBeTruthy();
    expect(screen.getByText(/usuario de cajero para abrir el POS/)).toBeTruthy();
    expect((screen.getByPlaceholderText("tucorreo@negocio.com") as HTMLInputElement).value).toBe("cajero1@negocio.com");
    expect((document.querySelector('input[name="next"]') as HTMLInputElement).value).toBe("/");
  });

  it("un rol inventado en la URL se ignora", () => {
    busqueda = new URLSearchParams("rol=admin");
    render(<LoginPage />);
    expect(screen.getByRole("heading", { name: "Bienvenido de nuevo" })).toBeTruthy();
  });
});
