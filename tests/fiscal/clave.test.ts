import { describe, it, expect } from "vitest";
import { cifrarClave, descifrarClave, generarClaveTemporal, validarClave } from "@/lib/auth/clave";

describe("contraseñas cifradas", () => {
  it("se descifran a lo mismo (incluye tildes, símbolos y espacios)", () => {
    for (const c of ["Mesero2026", "contraseña-ñandú!", "con espacios  ", "a".repeat(72)]) {
      expect(descifrarClave(cifrarClave(c, "secreto"), "secreto")).toBe(c);
    }
  });

  it("NO queda en texto plano y cada cifrado es distinto (IV aleatorio)", () => {
    const a = cifrarClave("Mesero2026", "secreto");
    const b = cifrarClave("Mesero2026", "secreto");
    expect(a).not.toContain("Mesero2026");
    expect(a).not.toBe(b);
    expect(a.startsWith("v1.")).toBe(true);
  });

  it("con otra llave no se puede leer", () => {
    expect(descifrarClave(cifrarClave("Mesero2026", "secreto"), "otra-llave")).toBeNull();
  });

  it("un dato alterado o inválido devuelve null, sin lanzar", () => {
    const token = cifrarClave("Mesero2026", "secreto");
    const alterado = token.slice(0, -2) + (token.endsWith("AA") ? "BB" : "AA");
    expect(descifrarClave(alterado, "secreto")).toBeNull();
    expect(descifrarClave("basura", "secreto")).toBeNull();
    expect(descifrarClave("v1.corto", "secreto")).toBeNull();
    expect(descifrarClave(null, "secreto")).toBeNull();
    expect(descifrarClave(undefined, "secreto")).toBeNull();
    expect(descifrarClave("", "secreto")).toBeNull();
  });

  it("usa CLAVE_CIFRADO o, si no hay, la service role key; sin ninguna falla claro", () => {
    const previo = { c: process.env.CLAVE_CIFRADO, s: process.env.SUPABASE_SERVICE_ROLE_KEY };
    try {
      delete process.env.CLAVE_CIFRADO;
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-de-prueba";
      const t = cifrarClave("x12345");
      expect(descifrarClave(t)).toBe("x12345");

      process.env.CLAVE_CIFRADO = "llave-propia";
      expect(descifrarClave(t)).toBeNull(); // ya usa otra llave
      expect(descifrarClave(cifrarClave("y12345"))).toBe("y12345");

      delete process.env.CLAVE_CIFRADO;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      expect(() => cifrarClave("z")).toThrow(/CLAVE_CIFRADO/);
    } finally {
      if (previo.c === undefined) delete process.env.CLAVE_CIFRADO;
      else process.env.CLAVE_CIFRADO = previo.c;
      if (previo.s === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = previo.s;
    }
  });
});

describe("validarClave / generarClaveTemporal", () => {
  it("exige al menos 6 caracteres y máximo 72", () => {
    expect(validarClave("12345")).toMatch(/al menos 6/);
    expect(validarClave("123456")).toBeNull();
    expect(validarClave("a".repeat(73))).toMatch(/72/);
  });
  it("genera claves de 10 caracteres sin símbolos ambiguos y siempre válidas", () => {
    const vistas = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const c = generarClaveTemporal();
      expect(c).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{10}$/);
      expect(validarClave(c)).toBeNull();
      vistas.add(c);
    }
    expect(vistas.size).toBe(200);
  });
});
