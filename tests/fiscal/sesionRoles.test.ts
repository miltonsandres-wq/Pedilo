import { describe, it, expect, vi, beforeEach } from "vitest";

let usuario: { id: string; tenant_id: string; sucursal_id: string | null; rol: string; nombre: string; activo: boolean } | null = null;
let suscripcion = "activa";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: usuario ? { id: usuario.id, email: "x@y.com" } : null } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: usuario }),
          maybeSingle: async () => ({ data: usuario }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { suscripcion_estado: suscripcion, prueba_vence_el: null, suscripcion_vence_el: null },
          }),
        }),
      }),
    }),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { requireAdmin, requireOperativo, requireSucursal } from "@/lib/auth/session";

const persona = (rol: string, sucursal: string | null = "S1") => ({
  id: "U1", tenant_id: "T1", sucursal_id: sucursal, rol, nombre: "Ana", activo: true,
});

async function ir(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
  } catch (e) {
    const m = (e as Error).message;
    if (m.startsWith("REDIRECT:")) return m.slice("REDIRECT:".length);
    throw e;
  }
  return "ENTRA";
}

beforeEach(() => {
  usuario = null;
  suscripcion = "activa";
});

describe("requireAdmin (panel del dueño)", () => {
  it("el admin entra", async () => {
    usuario = persona("admin", null);
    expect(await ir(requireAdmin())).toBe("ENTRA");
  });
  it("cada otro rol vuelve a SU pantalla: cocina a /cocina, cajero y mesero a /pos", async () => {
    usuario = persona("cocina");
    expect(await ir(requireAdmin())).toBe("/cocina");
    usuario = persona("cajero");
    expect(await ir(requireAdmin())).toBe("/pos");
    usuario = persona("mesero");
    expect(await ir(requireAdmin())).toBe("/pos");
  });
  it("sin sesión va al login y con la suscripción suspendida a /suspendida", async () => {
    usuario = null;
    expect(await ir(requireAdmin())).toBe("/login");
    usuario = persona("admin", null);
    suscripcion = "suspendida";
    expect(await ir(requireAdmin())).toBe("/suspendida");
  });
});

describe("requireSucursal (POS)", () => {
  it("cajero y mesero entran al POS", async () => {
    usuario = persona("cajero");
    expect(await ir(requireSucursal())).toBe("ENTRA");
    usuario = persona("mesero");
    expect(await ir(requireSucursal())).toBe("ENTRA");
  });
  it("cocina NO entra al POS: se le manda a su pantalla", async () => {
    usuario = persona("cocina");
    expect(await ir(requireSucursal())).toBe("/cocina");
  });
  it("el admin sin sucursal fija va a su panel", async () => {
    usuario = persona("admin", null);
    expect(await ir(requireSucursal())).toBe("/admin");
  });
});

describe("requireOperativo (pantalla de cocina)", () => {
  it("cocina, cajero, mesero y admin pueden abrir la cocina", async () => {
    for (const rol of ["cocina", "cajero", "mesero", "admin"]) {
      usuario = persona(rol, rol === "admin" ? null : "S1");
      expect(await ir(requireOperativo()), rol).toBe("ENTRA");
    }
  });
  it("con la suscripción suspendida ni cocina puede entrar", async () => {
    usuario = persona("cocina");
    suscripcion = "suspendida";
    expect(await ir(requireOperativo())).toBe("/suspendida");
  });
});
