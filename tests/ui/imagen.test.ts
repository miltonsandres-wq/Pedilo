import { describe, it, expect } from "vitest";
import { mensajeSubida, prepararImagen, ErrorImagen } from "@/lib/imagen/preparar";

describe("subida de imágenes (logo y fotos)", () => {
  it("rechaza lo que no es imagen con un mensaje claro", async () => {
    const pdf = new File(["x"], "menu.pdf", { type: "application/pdf" });
    await expect(prepararImagen(pdf)).rejects.toBeInstanceOf(ErrorImagen);
    await expect(prepararImagen(pdf)).rejects.toThrow(/no es una imagen/);
  });

  it("un SVG liviano pasa tal cual y uno enorme se rechaza", async () => {
    const chico = new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" });
    expect(await prepararImagen(chico)).toBe(chico);
    const grande = new File([new Uint8Array(2 * 1024 * 1024)], "logo.svg", { type: "image/svg+xml" });
    await expect(prepararImagen(grande)).rejects.toThrow(/pesa demasiado/);
  });

  it("traduce los fallos de red, de tamaño y de almacenamiento", () => {
    expect(mensajeSubida(new Error("Body exceeded 1 MB limit"), "x")).toMatch(/pesa demasiado/);
    expect(mensajeSubida(new Error("Bucket not found"), "x")).toMatch(/almacenamiento/);
    expect(mensajeSubida(new Error("Failed to fetch"), "x")).toMatch(/Sin conexión/);
    expect(mensajeSubida(new Error("An error occurred in the Server Components render. The specific message is omitted in production builds"), "Por defecto")).toBe("Por defecto");
    expect(mensajeSubida(new Error("La imagen pesa demasiado (máximo 4 MB)."), "x")).toMatch(/máximo 4 MB/);
  });
});
