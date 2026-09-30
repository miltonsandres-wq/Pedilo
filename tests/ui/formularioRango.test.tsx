// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const crearRango = vi.fn();
vi.mock("@/app/admin/fiscal/actions", () => ({
  crearRango: (prev: unknown, fd: FormData) => crearRango(prev, fd),
  activarFacturacion: vi.fn(),
  anularDocumento: vi.fn(),
  crearDispositivo: vi.fn(),
  eliminarRango: vi.fn(),
  guardarEmisor: vi.fn(),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/fiscal/rangos" }));

import { FormularioRango } from "@/components/admin/fiscal/FormularioRango";

const CAI = "A1B2C3-D4E5F6-A1B2C3-D4E5F6-A1B2C3-D4";
const cajas = [
  { id: "D1", nombre: "Caja 1", sucursalNombre: "Centro", establecimiento: "001", puntoEmision: "002" },
];

afterEach(cleanup);
beforeEach(() => crearRango.mockReset());

const boton = () => screen.getByRole("button", { name: /Cargar rango|Guardando/ }) as HTMLButtonElement;

async function llenarValido(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText("Caja (punto de emisión)"), "D1");
  await user.type(screen.getByLabelText("CAI"), CAI);
  await user.type(screen.getByLabelText("Desde (número)"), "1");
  await user.type(screen.getByLabelText("Hasta (número)"), "500");
  await user.type(screen.getByLabelText("Fecha límite de emisión"), "2099-12-31");
}

describe("FormularioRango", () => {
  it("empieza deshabilitado y la factura fija el código 01", () => {
    render(<FormularioRango cajas={cajas} hoyHN="2030-06-15" />);
    expect(boton().disabled).toBe(true);
    const tipo = screen.getByLabelText("Código del documento (2 dígitos)") as HTMLInputElement;
    expect(tipo.value).toBe("01");
    expect(tipo.readOnly).toBe(true);
  });

  it("valida el CAI en vivo: contador y error de formato al salir del campo", async () => {
    const user = userEvent.setup();
    render(<FormularioRango cajas={cajas} hoyHN="2030-06-15" />);
    const cai = screen.getByLabelText("CAI");
    await user.type(cai, "a1b2c3-d4");
    expect(screen.getByText("9/37")).toBeTruthy();
    expect((cai as HTMLInputElement).value).toBe("A1B2C3-D4"); // sube a mayúsculas al escribir
    await user.tab();
    expect(screen.getByText(/Formato inválido/)).toBeTruthy();

    await user.clear(cai);
    await user.type(cai, CAI);
    expect(screen.getByText("37/37")).toBeTruthy();
    expect(screen.queryByText(/Formato inválido/)).toBeNull();
  });

  it("solo deja escribir dígitos en desde/hasta y avisa si desde > hasta", async () => {
    const user = userEvent.setup();
    render(<FormularioRango cajas={cajas} hoyHN="2030-06-15" />);
    const desde = screen.getByLabelText("Desde (número)") as HTMLInputElement;
    await user.type(desde, "1a0b");
    expect(desde.value).toBe("10");
    await user.type(screen.getByLabelText("Hasta (número)"), "5");
    await user.tab();
    expect(screen.getByText(/«Desde» no puede ser mayor que «Hasta»/)).toBeTruthy();
  });

  it("rechaza una fecha límite que ya pasó", async () => {
    const user = userEvent.setup();
    render(<FormularioRango cajas={cajas} hoyHN="2030-06-15" />);
    await user.type(screen.getByLabelText("Fecha límite de emisión"), "2030-06-01");
    await user.tab();
    expect(screen.getByText(/ya pasó/)).toBeTruthy();
  });

  it("con todo válido muestra el primer y último número y habilita el botón", async () => {
    const user = userEvent.setup();
    render(<FormularioRango cajas={cajas} hoyHN="2030-06-15" />);
    await llenarValido(user);
    expect(screen.getByTestId("vista-rango").textContent).toBe("001-002-01-00000001  →  001-002-01-00000500  (500 documentos)");
    expect(boton().disabled).toBe(false);
  });

  it("notas de crédito: el código lo escribe quien carga el rango y no puede ser 01", async () => {
    const user = userEvent.setup();
    render(<FormularioRango cajas={cajas} hoyHN="2030-06-15" />);
    await user.selectOptions(screen.getByLabelText("Documento"), "nota_credito");
    const tipo = screen.getByLabelText("Código del documento (2 dígitos)") as HTMLInputElement;
    expect(tipo.readOnly).toBe(false);
    expect(tipo.value).toBe("");
    await user.type(tipo, "01");
    await user.tab();
    expect(screen.getByText(/El 01 es de la factura/)).toBeTruthy();
    await user.clear(tipo);
    await user.type(tipo, "03");
    expect(screen.queryByText(/El 01 es de la factura/)).toBeNull();
  });

  it("al guardar manda los campos al servidor, muestra el resultado y limpia el formulario", async () => {
    crearRango.mockResolvedValue({ ok: true, mensaje: "Rango cargado." });
    const user = userEvent.setup();
    render(<FormularioRango cajas={cajas} hoyHN="2030-06-15" />);
    await llenarValido(user);
    await user.click(boton());

    expect(await screen.findByText("Rango cargado.")).toBeTruthy();
    const fd = crearRango.mock.calls[0][1] as FormData;
    expect(Object.fromEntries(fd.entries())).toMatchObject({
      dispositivo_id: "D1", clase: "factura", tipo_doc: "01", cai: CAI, desde: "1", hasta: "500", fecha_limite: "2099-12-31",
    });
    await waitFor(() => expect((screen.getByLabelText("CAI") as HTMLInputElement).value).toBe(""));
  });

  it("muestra el error del servidor (por ejemplo un traslape) y conserva lo escrito", async () => {
    crearRango.mockResolvedValue({ ok: false, error: "Ese rango se traslapa con otro ya cargado para esta caja y este tipo de documento." });
    const user = userEvent.setup();
    render(<FormularioRango cajas={cajas} hoyHN="2030-06-15" />);
    await llenarValido(user);
    await user.click(boton());
    expect(await screen.findByText(/se traslapa con otro ya cargado/)).toBeTruthy();
    expect((screen.getByLabelText("CAI") as HTMLInputElement).value).toBe(CAI);
  });

  it("sin cajas avisa que primero hay que crear una", () => {
    render(<FormularioRango cajas={[]} hoyHN="2030-06-15" />);
    expect(screen.getByText(/Primero crea una caja/)).toBeTruthy();
  });
});
