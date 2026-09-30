import { describe, it, expect, vi, beforeEach } from "vitest";
import { descifrarClave } from "@/lib/auth/clave";
import { mensajeErrorUsuario } from "@/lib/auth/errores";
import { esRolAsignable, esRolDePersonal, INFO_ROL } from "@/lib/auth/roles";
import { rutaInicialPorRol } from "@/lib/auth/rutas";

// ---- Supabase simulado -------------------------------------------------------
const createUser = vi.fn();
const deleteUser = vi.fn();
const updateUserById = vi.fn();

interface Escritura { tabla: string; tipo: "insert" | "update"; datos: Record<string, unknown>; filtros: [string, unknown][] }
let escrituras: Escritura[] = [];
let sucursalesValidas = ["S1", "S2"];
let usuarioActual: { id: string; rol: string; sucursal_id: string | null } | null = null;
let claveCifradaGuardada: string | null = null;
let perfilFalla = false;

class Consulta implements PromiseLike<{ data: unknown; error: unknown }> {
  private tipo: "select" | "insert" | "update" = "select";
  private datos: Record<string, unknown> = {};
  private filtros: [string, unknown][] = [];
  constructor(private tabla: string) {}
  select() {
    return this;
  }
  insert(d: Record<string, unknown>) {
    this.tipo = "insert";
    this.datos = d;
    return this;
  }
  update(d: Record<string, unknown>) {
    this.tipo = "update";
    this.datos = d;
    return this;
  }
  eq(c: string, v: unknown) {
    this.filtros.push([c, v]);
    return this;
  }
  maybeSingle() {
    return this;
  }
  then<T1 = { data: unknown; error: unknown }, T2 = never>(
    ok?: ((v: { data: unknown; error: unknown }) => T1 | PromiseLike<T1>) | null,
    ko?: ((r: unknown) => T2 | PromiseLike<T2>) | null
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.resolver()).then(ok, ko);
  }
  private resolver(): { data: unknown; error: unknown } {
    if (this.tipo !== "select") {
      escrituras.push({ tabla: this.tabla, tipo: this.tipo, datos: this.datos, filtros: this.filtros });
      return { data: null, error: this.tabla === "usuarios" && this.tipo === "insert" && perfilFalla ? { message: "rls" } : null };
    }
    if (this.tabla === "sucursales") {
      const id = this.filtros.find(([c]) => c === "id")?.[1] as string;
      return { data: sucursalesValidas.includes(id) ? { id } : null, error: null };
    }
    if (this.tabla === "usuarios") {
      return { data: usuarioActual ? { ...usuarioActual, clave_cifrada: claveCifradaGuardada } : null, error: null };
    }
    return { data: null, error: null };
  }
}

vi.mock("@/lib/auth/session", () => ({ requireAdmin: async () => ({ tenant_id: "T1", id: "YO" }) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { createUser, deleteUser, updateUserById } } }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: (t: string) => new Consulta(t) }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { actualizarUsuario, crearUsuario, verClaveUsuario } from "@/app/admin/equipo/actions";

function form(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

async function destino(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
  } catch (e) {
    const m = (e as Error).message;
    if (m.startsWith("REDIRECT:")) return decodeURIComponent(m.slice("REDIRECT:".length));
    throw e;
  }
  return "SIN_REDIRECT";
}

const base = { nombre: "Milton", email: "Mesero@Negocio.com ", rol: "mesero", sucursal_id: "S1", clave: "" };
const de = (tabla: string, tipo: Escritura["tipo"]) => escrituras.filter((e) => e.tabla === tabla && e.tipo === tipo);

beforeEach(() => {
  process.env.CLAVE_CIFRADO = "llave-de-prueba";
  createUser.mockReset();
  deleteUser.mockReset();
  updateUserById.mockReset();
  updateUserById.mockResolvedValue({ error: null });
  createUser.mockResolvedValue({ data: { user: { id: "NUEVO" } }, error: null });
  escrituras = [];
  sucursalesValidas = ["S1", "S2"];
  usuarioActual = null;
  claveCifradaGuardada = null;
  perfilFalla = false;
});

describe("roles del equipo", () => {
  it("son administrador, cajero, mesero y cocina", () => {
    expect(Object.keys(INFO_ROL).sort()).toEqual(["admin", "cajero", "cocina", "mesero"]);
    for (const r of ["admin", "cajero", "mesero", "cocina"]) expect(esRolAsignable(r)).toBe(true);
    expect(esRolAsignable("gerente")).toBe(false);
    expect(esRolDePersonal("cocina")).toBe(true);
    expect(esRolDePersonal("admin")).toBe(false); // el admin no se asigna como «personal»
  });

  it("cada rol entra a su pantalla: cocina SOLO a cocina", () => {
    expect(rutaInicialPorRol("admin")).toBe("/admin");
    expect(rutaInicialPorRol("cocina")).toBe("/cocina");
    expect(rutaInicialPorRol("cajero")).toBe("/pos");
    expect(rutaInicialPorRol("mesero")).toBe("/pos");
  });
});

describe("crearUsuario: rol cocina y demás", () => {
  it("crea un usuario de COCINA amarrado a su sucursal", async () => {
    const url = await destino(crearUsuario(form({ ...base, rol: "cocina", clave: "Cocina2026" })));
    expect(url).toBe("/admin/equipo?nuevoEmail=mesero@negocio.com&nuevoRol=cocina");
    expect(de("usuarios", "insert")[0].datos).toMatchObject({ id: "NUEVO", tenant_id: "T1", rol: "cocina", sucursal_id: "S1", nombre: "Milton" });
    expect(descifrarClave(de("usuarios", "insert")[0].datos.clave_cifrada as string)).toBe("Cocina2026");
  });

  it("cajero, mesero y cocina NECESITAN sucursal; el admin no", async () => {
    for (const rol of ["cajero", "mesero", "cocina"]) {
      expect(await destino(crearUsuario(form({ ...base, rol, sucursal_id: "" })))).toContain("necesitan una sucursal");
    }
    expect(createUser).not.toHaveBeenCalled();
    await destino(crearUsuario(form({ ...base, rol: "admin", sucursal_id: "" })));
    expect(de("usuarios", "insert")[0].datos).toMatchObject({ rol: "admin", sucursal_id: null });
  });

  it("un admin nuevo no queda amarrado a ninguna sucursal aunque se mande una", async () => {
    await destino(crearUsuario(form({ ...base, rol: "admin", sucursal_id: "S1" })));
    expect(de("usuarios", "insert")[0].datos.sucursal_id).toBeNull();
    const url = await destino(crearUsuario(form({ ...base, rol: "admin", sucursal_id: "" })));
    expect(url).not.toContain("nuevoRol"); // un admin no lleva enlace de panel de personal
  });

  it("rechaza roles inventados y sucursales de otro negocio, sin crear la cuenta", async () => {
    expect(await destino(crearUsuario(form({ ...base, rol: "gerente" })))).toContain("Elige un rol válido");
    expect(await destino(crearUsuario(form({ ...base, sucursal_id: "AJENA" })))).toContain("sucursal elegida no existe");
    expect(createUser).not.toHaveBeenCalled();
    expect(escrituras).toHaveLength(0);
  });

  it("un correo que ya tiene cuenta muestra un aviso claro, no un error de servidor", async () => {
    createUser.mockResolvedValue({ data: { user: null }, error: { message: "already been registered", code: "email_exists" } });
    const url = await destino(crearUsuario(form(base)));
    expect(url).toContain("/admin/equipo?errorUsuario=");
    expect(url).toContain("Ese correo ya tiene una cuenta en Pedilo");
    expect(de("usuarios", "insert")).toHaveLength(0);
  });

  it("contraseña corta y campos vacíos: aviso y no crea nada", async () => {
    expect(await destino(crearUsuario(form({ ...base, clave: "123" })))).toContain("errorClave=");
    expect(await destino(crearUsuario(form({ ...base, nombre: " " })))).toContain("Escribe el nombre y el correo");
    expect(createUser).not.toHaveBeenCalled();
  });

  it("si falla guardar el perfil, deshace la cuenta creada y avisa", async () => {
    perfilFalla = true;
    const url = await destino(crearUsuario(form(base)));
    expect(deleteUser).toHaveBeenCalledWith("NUEVO");
    expect(url).toContain("No se pudo guardar al usuario");
  });

  it("sin contraseña escrita genera una válida y la guarda para poder verla", async () => {
    await destino(crearUsuario(form(base)));
    const enviada = createUser.mock.calls[0][0].password as string;
    expect(enviada).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{10}$/);
    expect(descifrarClave(de("usuarios", "insert")[0].datos.clave_cifrada as string)).toBe(enviada);
    expect(createUser.mock.calls[0][0].email).toBe("mesero@negocio.com");
  });
});

describe("actualizarUsuario", () => {
  it("cambia el rol de un cajero a COCINA y su sucursal", async () => {
    usuarioActual = { id: "U1", rol: "cajero", sucursal_id: "S1" };
    await actualizarUsuario("U1", form({ nombre: " Ana ", rol: "cocina", sucursal_id: "S2", activo: "on" }));
    expect(de("usuarios", "update")[0].datos).toMatchObject({ nombre: "Ana", rol: "cocina", sucursal_id: "S2", activo: true });
  });

  it("un administrador SIGUE siendo administrador y sin sucursal, pase lo que pase en el formulario", async () => {
    usuarioActual = { id: "ADM2", rol: "admin", sucursal_id: null };
    await actualizarUsuario("ADM2", form({ nombre: "Otro", rol: "mesero", sucursal_id: "S1", activo: "on" }));
    expect(de("usuarios", "update")[0].datos).toMatchObject({ rol: "admin", sucursal_id: null });
  });

  it("no se puede subir a nadie a administrador por el formulario, ni usar un rol inventado", async () => {
    usuarioActual = { id: "U1", rol: "mesero", sucursal_id: "S1" };
    await actualizarUsuario("U1", form({ nombre: "Ana", rol: "admin", sucursal_id: "S1", activo: "on" }));
    expect(de("usuarios", "update")[0].datos.rol).toBe("mesero");
    escrituras = [];
    await actualizarUsuario("U1", form({ nombre: "Ana", rol: "gerente", sucursal_id: "S1", activo: "on" }));
    expect(de("usuarios", "update")[0].datos.rol).toBe("mesero");
  });

  it("nadie se desactiva a sí mismo (se quedaría sin acceso)", async () => {
    usuarioActual = { id: "YO", rol: "admin", sucursal_id: null };
    await actualizarUsuario("YO", form({ nombre: "Yo" })); // sin «activo» en el formulario
    expect(de("usuarios", "update")[0].datos.activo).toBe(true);
    usuarioActual = { id: "U1", rol: "mesero", sucursal_id: "S1" };
    escrituras = [];
    await actualizarUsuario("U1", form({ nombre: "Ana", rol: "mesero", sucursal_id: "S1" }));
    expect(de("usuarios", "update")[0].datos.activo).toBe(false); // a otro sí se le puede desactivar
  });

  it("una sucursal de otro negocio se ignora (conserva la actual)", async () => {
    usuarioActual = { id: "U1", rol: "mesero", sucursal_id: "S1" };
    await actualizarUsuario("U1", form({ nombre: "Ana", rol: "mesero", sucursal_id: "AJENA", activo: "on" }));
    expect(de("usuarios", "update")[0].datos.sucursal_id).toBe("S1");
  });

  it("un usuario de otro negocio (RLS no lo devuelve) no se toca", async () => {
    usuarioActual = null;
    await actualizarUsuario("AJENO", form({ nombre: "X", rol: "cocina", clave: "Nueva2026" }));
    expect(escrituras).toHaveLength(0);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("cambia la contraseña en Auth y guarda la copia cifrada; una corta se rechaza sin tocar nada", async () => {
    usuarioActual = { id: "U1", rol: "cocina", sucursal_id: "S1" };
    await actualizarUsuario("U1", form({ nombre: "Ana", rol: "cocina", sucursal_id: "S1", activo: "on", clave: "Nueva2026" }));
    expect(updateUserById).toHaveBeenCalledWith("U1", { password: "Nueva2026" });
    expect(descifrarClave(de("usuarios", "update")[0].datos.clave_cifrada as string)).toBe("Nueva2026");

    escrituras = [];
    updateUserById.mockClear();
    const url = await destino(actualizarUsuario("U1", form({ nombre: "Ana", rol: "cocina", sucursal_id: "S1", clave: "123" })));
    expect(url).toContain("errorClave=");
    expect(updateUserById).not.toHaveBeenCalled();
    expect(escrituras).toHaveLength(0);
  });

  it("el nombre no puede quedar vacío", async () => {
    usuarioActual = { id: "U1", rol: "mesero", sucursal_id: "S1" };
    expect(await destino(actualizarUsuario("U1", form({ nombre: "  ", rol: "mesero", sucursal_id: "S1" })))).toContain("El nombre no puede quedar vacío");
  });
});

describe("verClaveUsuario", () => {
  it("descifra la contraseña de alguien del negocio y devuelve null si no hay una guardada", async () => {
    const { cifrarClave } = await import("@/lib/auth/clave");
    usuarioActual = { id: "U1", rol: "mesero", sucursal_id: "S1" };
    claveCifradaGuardada = cifrarClave("Mesero2026");
    expect(await verClaveUsuario("U1")).toEqual({ ok: true, clave: "Mesero2026" });
    claveCifradaGuardada = null;
    expect(await verClaveUsuario("U1")).toEqual({ ok: true, clave: null });
    usuarioActual = null; // de otro negocio
    expect(await verClaveUsuario("AJENO")).toEqual({ ok: false, clave: null });
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
