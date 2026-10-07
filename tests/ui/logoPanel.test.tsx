// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/admin" }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { signOut: vi.fn() } }) }));
vi.mock("@/components/CerrarSesionBoton", () => ({ CerrarSesionBoton: () => null }));

import { AdminShell } from "@/components/admin/AdminShell";
import { CartaCliente } from "@/components/carta/CartaCliente";

vi.mock("@/app/carta/[token]/actions", () => ({ enviarPedidoCliente: vi.fn() }));

afterEach(cleanup);

describe("logo del negocio en el panel", () => {
  it("con logo, lo muestra y pone el nombre del negocio en lugar de «Pedilo»", () => {
    render(<AdminShell usuarioNombre="Ana" usuarioEmail="a@x.com" negocioNombre="Fondita Doña Ana" logoUrl="https://x.test/logo.png"><p>contenido</p></AdminShell>);
    const logos = screen.getAllByAltText("Logo del negocio") as HTMLImageElement[];
    expect(logos.length).toBeGreaterThan(0);
    expect(logos[0].src).toBe("https://x.test/logo.png");
    expect(screen.getAllByText("Fondita Doña Ana").length).toBeGreaterThan(0);
    expect(screen.queryByText("Pedilo")).toBeNull();
  });

  it("sin logo sigue mostrando la marca de Pedilo", () => {
    render(<AdminShell usuarioNombre="Ana" usuarioEmail="a@x.com"><p>contenido</p></AdminShell>);
    expect(screen.queryByAltText("Logo del negocio")).toBeNull();
    expect(screen.getAllByText("Pedilo").length).toBeGreaterThan(0);
  });
});

describe("descripción de los platillos en el menú del QR", () => {
  it("se ve completa (sin cortarla en una línea)", () => {
    const larga = "Pollo asado con tajadas, repollo y salsa de la casa. Acompañado de arroz y frijoles.";
    render(<CartaCliente token="T" categorias={[]} productos={[{ id: "A", nombre: "Pollo", descripcion: larga, precio: 120, foto_url: null, categoria_id: null }]} />);
    const p = screen.getByText(larga);
    expect(p.className).not.toContain("truncate");
    expect(p.className).not.toContain("line-clamp");
  });
});
