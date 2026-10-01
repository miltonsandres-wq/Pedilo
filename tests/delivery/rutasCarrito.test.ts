import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SLUGS_RESERVADOS, esRutaPublicaDelivery, slugDesdeNombre, slugValido } from "@/lib/delivery/rutas";
import { cambiarCantidad, cambiarNota, limpiarCarrito, subtotal, totalUnidades, MAX_POR_PRODUCTO } from "@/lib/delivery/carrito";
import { textoHorario } from "@/lib/delivery/horario";

describe("rutas públicas de delivery", () => {
  it("la lista de slugs reservados de TS coincide con el CHECK de la migración", () => {
    const sql = fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations/0022_delivery_config_zonas.sql"), "utf8");
    const bloque = /slug <> all \(array\[([\s\S]*?)\]\)/.exec(sql)![1];
    const enSql = [...bloque.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    expect(enSql).toEqual([...SLUGS_RESERVADOS].sort());
  });

  it("menú y seguimiento son públicos; las rutas de la app y los slugs reservados no", () => {
    expect(esRutaPublicaDelivery("/fondita-ana")).toBe(true);
    expect(esRutaPublicaDelivery("/fondita-ana/pedido/AbC123_-xyz")).toBe(true);
    for (const r of ["/", "/admin", "/pos", "/pos/mesa/1", "/cocina", "/login", "/repartidor", "/carta/abc", "/admin/menu"]) {
      expect(esRutaPublicaDelivery(r), r).toBe(false);
    }
    expect(esRutaPublicaDelivery("/fondita/otra/cosa")).toBe(false);
    expect(esRutaPublicaDelivery("/fondita/pedido")).toBe(false);
    expect(esRutaPublicaDelivery("/fondita/pedido/a/b")).toBe(false);
    expect(esRutaPublicaDelivery("/Mayus")).toBe(false);
  });

  it("slugs válidos, inválidos y sugeridos desde el nombre", () => {
    expect(slugValido("fondita-ana")).toBe(true);
    expect(slugValido("ab")).toBe(false);
    expect(slugValido("admin")).toBe(false);
    expect(slugValido("Con Espacios")).toBe(false);
    expect(slugDesdeNombre("Fondita Doña Ana")).toBe("fondita-dona-ana");
    expect(slugValido(slugDesdeNombre("La Ñ"))).toBe(true);
    expect(slugValido(slugDesdeNombre("!!"))).toBe(true);
  });
});

describe("carrito", () => {
  it("suma, resta, limita y elimina al llegar a cero", () => {
    let c = cambiarCantidad({}, "a", 1);
    c = cambiarCantidad(c, "a", 2);
    expect(c.a.cantidad).toBe(3);
    c = cambiarCantidad(c, "a", -3);
    expect(c).toEqual({});
    expect(cambiarCantidad({}, "a", -1)).toEqual({});
    expect(cambiarCantidad({ a: { cantidad: MAX_POR_PRODUCTO, nota: "" } }, "a", 1).a.cantidad).toBe(MAX_POR_PRODUCTO);
  });

  it("subtotal en centavos exactos y unidades", () => {
    const c = { a: { cantidad: 3, nota: "" }, b: { cantidad: 1, nota: "" } };
    expect(subtotal(c, [{ id: "a", precio: 0.1 }, { id: "b", precio: 0.2 }])).toBe(0.5);
    expect(subtotal(c, [{ id: "a", precio: 33.33 }])).toBe(99.99);
    expect(totalUnidades(c)).toBe(4);
  });

  it("limpia lo guardado: quita productos que ya no están y datos corruptos", () => {
    const crudo = { a: { cantidad: 2, nota: "x" }, fuera: { cantidad: 1, nota: "" }, malo: { cantidad: "abc" }, neg: { cantidad: -1 }, enorme: { cantidad: 9999, nota: 5 } };
    expect(limpiarCarrito(crudo, new Set(["a", "malo", "neg", "enorme"]))).toEqual({
      a: { cantidad: 2, nota: "x" },
      enorme: { cantidad: MAX_POR_PRODUCTO, nota: "" },
    });
    expect(limpiarCarrito(null, new Set())).toEqual({});
    expect(limpiarCarrito("basura", new Set())).toEqual({});
  });

  it("notas con tope y solo sobre líneas existentes", () => {
    expect(cambiarNota({}, "a", "x")).toEqual({});
    expect(cambiarNota({ a: { cantidad: 1, nota: "" } }, "a", "z".repeat(500)).a.nota.length).toBe(200);
  });
});

describe("horario de hoy", () => {
  it("formatea los tramos del día o null si está cerrado", () => {
    const h = { lun: [{ desde: "10:00", hasta: "14:00" }, { desde: "18:00", hasta: "22:00" }] };
    expect(textoHorario(h, "lun")).toBe("10:00 a 14:00 y 18:00 a 22:00");
    expect(textoHorario(h, "mar")).toBeNull();
    expect(textoHorario(null, "lun")).toBeNull();
  });
});
