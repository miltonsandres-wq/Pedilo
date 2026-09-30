// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh, replace: vi.fn() }) }));

const finalizarConfiguracion = vi.fn();
const omitirConfiguracion = vi.fn();
vi.mock("@/app/configuracion-inicial/actions", () => ({
  finalizarConfiguracion: (d: unknown) => finalizarConfiguracion(d),
  omitirConfiguracion: () => omitirConfiguracion(),
}));
vi.mock("@/components/admin/SucursalLogoUploader", () => ({
  SucursalLogoUploader: ({ sucursalId }: { sucursalId: string }) => <div data-testid={`logo-${sucursalId}`}>subir logo</div>,
}));

import { AsistenteInicial } from "@/components/onboarding/AsistenteInicial";

const CAI = "A1B2C3-D4E5F6-A1B2C3-D4E5F6-A1B2C3-D4";
const HOY = "2030-06-15";
const una = [{ id: "S1", nombre: "Taquería Rosa", telefono: "2222-3333", direccion: "Col. Palmira", logoUrl: null }];
const dos = [
  ...una,
  { id: "S2", nombre: "Rosa Norte", telefono: "", direccion: "", logoUrl: null },
];

afterEach(cleanup);
beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  finalizarConfiguracion.mockReset();
  finalizarConfiguracion.mockResolvedValue({ ok: true, activada: true });
  omitirConfiguracion.mockReset();
});

const siguiente = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: /Siguiente/ }));

async function elegirFactura(user: ReturnType<typeof userEvent.setup>, si: boolean) {
  await user.click(screen.getByRole("button", { name: si ? /Sí, facturo con CAI/ : /No facturo con CAI/ }));
  await siguiente(user);
}

async function llenarFiscal(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("RTN (14 dígitos) *"), "0801-1999-123456");
}

describe("AsistenteInicial (configuración al registrar el negocio)", () => {
  it("empieza por los datos del negocio con lo que ya se registró y el logo", () => {
    render(<AsistenteInicial negocio="Taquería Rosa" hoyHN={HOY} sucursales={una} />);
    expect(screen.getByRole("heading", { name: "Datos de tu negocio" })).toBeTruthy();
    expect((screen.getByLabelText("Nombre del negocio") as HTMLInputElement).value).toBe("Taquería Rosa");
    expect((screen.getByLabelText("Teléfono") as HTMLInputElement).value).toBe("2222-3333");
    expect(screen.getByTestId("logo-S1")).toBeTruthy();
    expect(screen.getByText("Configurar después")).toBeTruthy();
  });

  it("no deja seguir con el nombre vacío", async () => {
    const user = userEvent.setup();
    render(<AsistenteInicial negocio="X" hoyHN={HOY} sucursales={una} />);
    await user.clear(screen.getByLabelText("Nombre del negocio"));
    await siguiente(user);
    expect(screen.getByText("Cada sucursal necesita un nombre.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Datos de tu negocio" })).toBeTruthy();
  });

  it("si NO factura con CAI: solo 3 pasos, sin pedir nada fiscal, y deja todo guardado", async () => {
    const user = userEvent.setup();
    render(<AsistenteInicial negocio="Taquería Rosa" hoyHN={HOY} sucursales={una} />);
    await user.clear(screen.getByLabelText("Dirección"));
    await user.type(screen.getByLabelText("Dirección"), "Av. Central 123");
    await siguiente(user);

    // hay que elegir una opción
    await siguiente(user);
    expect(screen.getByText("Elige una opción para continuar.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /No facturo con CAI/ }));
    expect(screen.getAllByRole("listitem").filter((li) => li.textContent?.match(/^\d/) || true).length).toBeGreaterThan(0);
    await siguiente(user);

    expect(screen.getByRole("heading", { name: "¡Todo listo!" })).toBeTruthy();
    expect(screen.getByText(/Sin facturación con CAI por ahora/)).toBeTruthy();
    expect(screen.queryByLabelText("RTN (14 dígitos) *")).toBeNull();

    await user.click(screen.getByRole("button", { name: /Finalizar y entrar al panel/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin"));
    expect(finalizarConfiguracion).toHaveBeenCalledWith({
      sucursales: [{ id: "S1", nombre: "Taquería Rosa", telefono: "2222-3333", direccion: "Av. Central 123" }],
      factura: false,
      emisor: undefined,
      rangos: undefined,
    });
  });

  it("si factura con CAI: pide datos fiscales (RTN de 14 dígitos) y el CAI, y los manda juntos", async () => {
    const user = userEvent.setup();
    render(<AsistenteInicial negocio="Taquería Rosa" hoyHN={HOY} sucursales={una} />);
    await siguiente(user);
    await elegirFactura(user, true);

    // datos fiscales: razón social y dirección ya vienen sugeridas
    expect(screen.getByRole("heading", { name: "Datos fiscales" })).toBeTruthy();
    expect((screen.getByLabelText("Razón social *") as HTMLInputElement).value).toBe("Taquería Rosa");
    expect((screen.getByLabelText("Dirección fiscal *") as HTMLInputElement).value).toBe("Col. Palmira");

    await user.type(screen.getByLabelText("RTN (14 dígitos) *"), "0801199912");
    expect(screen.getByText("10/14")).toBeTruthy();
    await siguiente(user);
    expect(screen.getByText("Revisa los datos fiscales marcados.")).toBeTruthy();
    expect(screen.getByText("El RTN debe tener 14 dígitos.")).toBeTruthy();

    await user.type(screen.getByLabelText("RTN (14 dígitos) *"), "3456"); // completa 14
    await siguiente(user);

    // CAI
    expect(screen.getByRole("heading", { name: "Tu CAI" })).toBeTruthy();
    await siguiente(user);
    expect(screen.getByText(/Carga el CAI de al menos una sucursal/)).toBeTruthy();

    await user.type(screen.getByLabelText("CAI"), "a1b2c3-d4");
    await user.type(screen.getByLabelText("Desde (número)"), "1");
    await user.type(screen.getByLabelText("Hasta (número)"), "500");
    await user.type(screen.getByLabelText("Fecha límite de emisión"), "2030-06-01");
    await siguiente(user);
    expect(screen.getByText("Revisa los datos del CAI marcados.")).toBeTruthy();
    expect(screen.getByText(/Formato inválido/)).toBeTruthy();
    expect(screen.getByText(/ya pasó/)).toBeTruthy();

    const cai = screen.getByLabelText("CAI");
    await user.clear(cai);
    await user.type(cai, CAI);
    const fecha = screen.getByLabelText("Fecha límite de emisión");
    await user.clear(fecha);
    await user.type(fecha, "2099-12-31");
    await siguiente(user);

    expect(screen.getByRole("heading", { name: "¡Todo listo!" })).toBeTruthy();
    expect(screen.getByText(/CAI cargado para 1 de 1 sucursal: se activará la facturación/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Finalizar y entrar al panel/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin"));
    const enviado = finalizarConfiguracion.mock.calls[0][0];
    expect(enviado.factura).toBe(true);
    expect(enviado.emisor).toMatchObject({ razonSocial: "Taquería Rosa", rtn: "08011999123456", direccionFiscal: "Col. Palmira" });
    expect(enviado.rangos).toEqual([{ sucursalId: "S1", cai: CAI, desde: "1", hasta: "500", fechaLimite: "2099-12-31" }]);
  });

  it("con varias sucursales cada una tiene su bloque de datos y de CAI; las que queden vacías se configuran después", async () => {
    const user = userEvent.setup();
    render(<AsistenteInicial negocio="Rosa" hoyHN={HOY} sucursales={dos} />);
    expect(screen.getByRole("heading", { name: "Tus sucursales" })).toBeTruthy();
    expect(screen.getByTestId("logo-S1")).toBeTruthy();
    expect(screen.getByTestId("logo-S2")).toBeTruthy();
    await siguiente(user);
    await elegirFactura(user, true);
    await llenarFiscal(user);
    await siguiente(user);

    // CAI solo para la primera sucursal
    const cais = screen.getAllByLabelText("CAI");
    expect(cais).toHaveLength(2);
    await user.type(cais[0], CAI);
    await user.type(screen.getAllByLabelText("Desde (número)")[0], "1");
    await user.type(screen.getAllByLabelText("Hasta (número)")[0], "100");
    await user.type(screen.getAllByLabelText("Fecha límite de emisión")[0], "2099-12-31");
    await siguiente(user);

    expect(screen.getByText(/CAI cargado para 1 de 2 sucursales: activarás la facturación cuando completes el resto/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Finalizar y entrar al panel/ }));
    await waitFor(() => expect(finalizarConfiguracion).toHaveBeenCalled());
    expect(finalizarConfiguracion.mock.calls[0][0].rangos.map((r: { sucursalId: string; cai: string }) => [r.sucursalId, r.cai])).toEqual([
      ["S1", CAI],
      ["S2", ""],
    ]);
  });

  it("un CAI a medias en una sucursal no deja avanzar", async () => {
    const user = userEvent.setup();
    render(<AsistenteInicial negocio="Rosa" hoyHN={HOY} sucursales={dos} />);
    await siguiente(user);
    await elegirFactura(user, true);
    await llenarFiscal(user);
    await siguiente(user);

    await user.type(screen.getAllByLabelText("CAI")[0], CAI);
    await user.type(screen.getAllByLabelText("Desde (número)")[0], "1");
    await user.type(screen.getAllByLabelText("Hasta (número)")[0], "100");
    await user.type(screen.getAllByLabelText("Fecha límite de emisión")[0], "2099-12-31");
    await user.type(screen.getAllByLabelText("CAI")[1], "AB"); // la segunda, a medias
    await siguiente(user);
    expect(screen.getByText("Revisa los datos del CAI marcados.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Tu CAI" })).toBeTruthy();
  });

  it("Anterior regresa conservando lo escrito y cambiar a «No» oculta lo fiscal", async () => {
    const user = userEvent.setup();
    render(<AsistenteInicial negocio="Rosa" hoyHN={HOY} sucursales={una} />);
    await siguiente(user);
    await elegirFactura(user, true);
    await user.type(screen.getByLabelText("RTN (14 dígitos) *"), "08011999123456");
    await user.click(screen.getByRole("button", { name: /Anterior/ }));
    expect(screen.getByRole("heading", { name: "¿Facturas con CAI?" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /No facturo con CAI/ }));
    await siguiente(user);
    expect(screen.getByRole("heading", { name: "¡Todo listo!" })).toBeTruthy(); // saltó directo al resumen
  });

  it("si el servidor rechaza, muestra el motivo, sigue en el resumen y permite reintentar", async () => {
    finalizarConfiguracion.mockResolvedValueOnce({ ok: false, error: "CAI: Formato inválido." });
    const user = userEvent.setup();
    render(<AsistenteInicial negocio="Rosa" hoyHN={HOY} sucursales={una} />);
    await siguiente(user);
    await elegirFactura(user, false);

    await user.click(screen.getByRole("button", { name: /Finalizar y entrar al panel/ }));
    expect(await screen.findByText("CAI: Formato inválido.")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Finalizar y entrar al panel/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin"));
    expect(finalizarConfiguracion).toHaveBeenCalledTimes(2);
  });

  it("«Configurar después» lo omite sin guardar nada", async () => {
    const user = userEvent.setup();
    render(<AsistenteInicial negocio="Rosa" hoyHN={HOY} sucursales={una} />);
    await user.click(screen.getByText("Configurar después"));
    expect(omitirConfiguracion).toHaveBeenCalledTimes(1);
    expect(finalizarConfiguracion).not.toHaveBeenCalled();
  });
});
