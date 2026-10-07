import { describe, it, expect } from "vitest";
import { leerJsonDeTexto, normalizarItemsMenu } from "@/lib/ia/normalizarMenu";

describe("normalizarItemsMenu (lo que devuelve la IA)", () => {
  it("pone «General» si falta la categoría y descarta filas sin nombre", () => {
    const r = normalizarItemsMenu([
      { nombre: "Baleada", precio: 45 },
      { categoria: "Bebidas", nombre: "  ", precio: 20 },
      null,
      "texto",
      { categoria: "Bebidas", nombre: "Limonada", descripcion: " con hielo ", precio: 35 },
    ]);
    expect(r).toEqual([
      { categoria: "General", nombre: "Baleada", descripcion: null, precio: 45 },
      { categoria: "Bebidas", nombre: "Limonada", descripcion: "con hielo", precio: 35 },
    ]);
  });

  it("entiende precios escritos como texto", () => {
    const precios = ["L. 1,250.50", "85,50", "1.250,00", "L 120", "gratis", 99.999, -5].map(
      (p) => normalizarItemsMenu([{ nombre: "X", precio: p }])[0].precio
    );
    expect(precios).toEqual([1250.5, 85.5, 1250, 120, 0, 100, 0]);
  });

  it("quita platillos repetidos (mismo nombre y categoría)", () => {
    const r = normalizarItemsMenu([
      { categoria: "Entradas", nombre: "Nachos", precio: 90 },
      { categoria: "entradas", nombre: "NACHOS", precio: 90 },
      { categoria: "Platos", nombre: "Nachos", precio: 150 },
    ]);
    expect(r).toHaveLength(2);
  });

  it("si no es una lista, no devuelve nada", () => {
    expect(normalizarItemsMenu(undefined)).toEqual([]);
    expect(normalizarItemsMenu({ items: [] })).toEqual([]);
  });
});

describe("leerJsonDeTexto (cuando la IA responde con texto)", () => {
  it("lee un objeto con items, con o sin bloque de código", () => {
    expect(leerJsonDeTexto('{"items":[{"nombre":"A","precio":1}]}')).toHaveLength(1);
    const conBloque = ["```json", '{"items":[{"nombre":"A","precio":1}]}', "```"].join("\n");
    expect(leerJsonDeTexto(conBloque)).toHaveLength(1);
  });
  it("lee una lista suelta y texto alrededor", () => {
    expect(leerJsonDeTexto('Aquí está: [{"nombre":"A","precio":1},{"nombre":"B","precio":2}] listo')).toHaveLength(2);
  });
  it("si no hay JSON válido devuelve null", () => {
    expect(leerJsonDeTexto("no pude leerlo")).toBeNull();
  });
});
