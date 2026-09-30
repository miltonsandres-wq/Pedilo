import { describe, it, expect, vi, beforeEach } from "vitest";
import { descifrarClave } from "@/lib/auth/clave";
import { mensajeErrorUsuario } from "@/lib/auth/errores";

// --- Supabase simulado ---
const createUser = vi.fn();
const deleteUser = vi.fn();
const updateUserById = vi.fn();
const insertUsuario = vi.fn();
let perfilFalla = false;

vi.mock("@/lib/auth/session", () => ({ requireAdmin: async () => ({ tenant_id: "T1", id: "ADMIN" }) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { createUser, deleteUser, updateUserById } } }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      insert: async (fila: Record<string, unknown>) => {
        insertUsuario(fila);
        return { error: perfilFalla ? { message: "rls" } : null };
      },
    }),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { crearUsuario } from "@/app/admin/sucursales/actions";

function form(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

const base = { nombre: "Milton", email: "Mesero@Negocio.com ", rol: "mesero", sucursal_id: "S1", clave: "" };

async function destino(fd: FormData): Promise<string> {
  try {
    await crearUsuario(fd);
  } catch (e) {
    const m = (e as Error).message;
    if (m.startsWith("REDIRECT:")) return decodeURIComponent(m.slice("REDIRECT:".length));
    throw e;
  }
  return "SIN_REDIRECT";
}

beforeEach(() => {
  process.env.CLAVE_CIFRADO = "llave-de-prueba";
  createUser.mockReset();
  deleteUser.mockReset();
  updateUserById.mockReset();
  insertUsuario.mockReset();
  perfilFalla = false;
  createUser.mockResolvedValue({ data: { user: { id: "NUEVO" } }, error: null });
});

describe("crearUsuario: nunca revienta la pantalla, avisa", () => {
  it("un correo que YA tiene cuenta muestra un aviso claro (antes era un error de servidor)", async () => {
    createUser.mockResolvedValue({ data: { user: null }, error: { message: "A user with this email address has already been registered", code: "email_exists" } });
    const url = await destino(form(base));
    expect(url).toContain("/admin/sucursales?errorUsuario=");
    expect(url).toContain("Ese correo ya tiene una cuenta en Pedilo");
    expect(insertUsuario).not.toHaveBeenCalled();
  });

  it("cualquier otro fallo de Auth también se convierte en aviso, no en excepción", async () => {
    createUser.mockResolvedValue({ data: { user: null }, error: { message: "algo raro" } });
    expect(await destino(form(base))).toContain("No se pudo crear el usuario");
    createUser.mockRejectedValue(new Error("red"));
    await expect(crearUsuario(form(base))).rejects.toThrow("red"); // errores de red reales siguen siendo errores (no se ocultan)
  });

  it("faltan nombre/correo o la sucursal del cajero: aviso", async () => {
    expect(await destino(form({ ...base, nombre: " " }))).toContain("Escribe el nombre y el correo");
    expect(await destino(form({ ...base, sucursal_id: "" }))).toContain("necesita una sucursal");
    expect(createUser).not.toHaveBeenCalled();
  });

  it("contraseña corta: aviso y no crea nada", async () => {
    const url = await destino(form({ ...base, clave: "123" }));
    expect(url).toContain("errorClave=");
    expect(url).toContain("al menos 6");
    expect(createUser).not.toHaveBeenCalled();
  });

  it("si falla guardar el perfil, deshace la cuenta creada y avisa", async () => {
    perfilFalla = true;
    const url = await destino(form(base));
    expect(deleteUser).toHaveBeenCalledWith("NUEVO");
    expect(url).toContain("No se pudo guardar al usuario");
  });
});

describe("crearUsuario: camino feliz", () => {
  it("usa la contraseña escrita, guarda su copia CIFRADA y normaliza el correo", async () => {
    const url = await destino(form({ ...base, clave: "Mesero2026" }));
    expect(url).toBe("/admin/sucursales?nuevoEmail=mesero@negocio.com&nuevoRol=mesero");

    expect(createUser).toHaveBeenCalledWith({ email: "mesero@negocio.com", password: "Mesero2026", email_confirm: true });
    const fila = insertUsuario.mock.calls[0][0];
    expect(fila).toMatchObject({ id: "NUEVO", tenant_id: "T1", sucursal_id: "S1", rol: "mesero", nombre: "Milton" });
    expect(fila.clave_cifrada).not.toContain("Mesero2026"); // no queda en claro
    expect(descifrarClave(fila.clave_cifrada)).toBe("Mesero2026"); // pero el admin puede verla
  });

  it("sin contraseña escrita genera una válida y la guarda para poder verla", async () => {
    await destino(form(base));
    const enviada = createUser.mock.calls[0][0].password as string;
    expect(enviada).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{10}$/);
    expect(descifrarClave(insertUsuario.mock.calls[0][0].clave_cifrada)).toBe(enviada);
  });

  it("un admin nuevo no queda atado a una sucursal (y no lleva enlace de panel de personal)", async () => {
    const url = await destino(form({ ...base, rol: "admin", sucursal_id: "" }));
    expect(url).not.toContain("nuevoRol");
    expect(insertUsuario.mock.calls[0][0]).toMatchObject({ rol: "admin", sucursal_id: null });
  });
});

describe("mensajeErrorUsuario", () => {
  it("traduce los casos comunes", () => {
    expect(mensajeErrorUsuario("User already registered")).toMatch(/ya tiene una cuenta/);
    expect(mensajeErrorUsuario(undefined, "email_exists")).toMatch(/ya tiene una cuenta/);
    expect(mensajeErrorUsuario("Unable to validate email address: invalid format")).toMatch(/correo no es válido/);
    expect(mensajeErrorUsuario("Password should be at least 6 characters")).toMatch(/contraseña/);
    expect(mensajeErrorUsuario("boom")).toMatch(/No se pudo crear/);
  });
});
