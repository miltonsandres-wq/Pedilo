// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const crearRango = vi.fn();
vi.mock("@/app/admin/fiscal/actions", () => ({
  crearRango: (prev: unknown, fd: FormData) => crearRango(prev, fd),
  activarFacturacion: vi.fn(),
  anularDocumento: vi.fn(),
  eliminarRango: vi.fn(),
  guardarEmisor: vi.fn(),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/fiscal/rangos" }));

import { FormularioRango } from "@/components/admin/fiscal/FormularioRango";

const CAI = "A1B2C3-D4E5F6-A1B2C3-D4E5F6-A1B2C3-D4";
const una = [{ id: "S1", nombre: "Centro", establecimiento: "000", puntoEmision: "001" }];
const dos = [
  ...una,
  { id: "S2", nombre: "Norte", establecimiento: "001", puntoEmision: "001" },
];

afterEach(cleanup);
beforeEach(() => crearRango.mockReset());

const boton = () => screen.getByRole("button", { name: /Cargar rango|Guardando/ }) as HTMLButtonElement;

async function llenarValido(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("CAI"), CAI);
  await user.type(screen.getByLabelText("Desde (número)"), "1");
  await user.type(screen.getByLabelText("Hasta (número)"), "500");
  await user.type(screen.getByLabelText("Fecha límite de emisión"), "2099-12-31");
}

describe("FormularioRango con UNA sucursal", () => {
  it("no pregunta la sucursal ni la caja: va a la única que hay", () => {
    render(<FormularioRango sucursales={una} hoyHN="2030-06-15" />);
    expect(screen.queryByLabelText("Sucursal")).toBeNull();
    expect(screen.queryByText(/caja/i)).toBeNull();
    expect((document.querySelector('input[name="sucursal_id"]') as HTMLInputElement).value).toBe("S1");
  });

  it("empieza deshabilitado y la factura fija el código 01", () => {
    render(<FormularioRango sucursales={una} hoyHN="2030-06-15" />);
    expect(boton().disabled).toBe(true);
    const tipo = screen.getByLabelText("Código del documento (2 dígitos)") as HTMLInputElement;
    expect(tipo.value).toBe("01");
    expect(tipo.readOnly).toBe(true);
  });

  it("valida el CAI en vivo: contador y error de formato al salir del campo", async () => {
    const user = userEvent.setup();
    render(<FormularioRango sucursales={una} hoyHN="2030-06-15" />);
    const cai = screen.getByLabelText("CAI");
    await user.type(cai, "a1b2c3-d4");
    expect(screen.getByText("9/37")).toBeTruthy();
    expect((cai as HTMLInputElement).value).toBe("A1B2C3-D4");
    await user.tab();
    expect(screen.getByText(/Formato inválido/)).toBeTruthy();

    await user.clear(cai);
    await user.type(cai, CAI);
    expect(screen.getByText("37/37")).toBeTruthy();
    expect(screen.queryByText(/Formato inválido/)).toBeNull();
  });

  it("solo deja escribir dígitos en desde/hasta y avisa si desde > hasta", async () => {
    const user = userEvent.setup();
    render(<FormularioRango sucursales={una} hoyHN="2030-06-15" />);
    const desde = screen.getByLabelText("Desde (número)") as HTMLInputElement;
    await user.type(desde, "1a0b");
    expect(desde.value).toBe("10");
    await user.type(screen.getByLabelText("Hasta (número)"), "5");
    await user.tab();
    expect(screen.getByText(/«Desde» no puede ser mayor que «Hasta»/)).toBeTruthy();
  });

  it("rechaza una fecha límite que ya pasó", async () => {
    const user = userEvent.setup();
    render(<FormularioRango sucursales={una} hoyHN="2030-06-15" />);
    await user.type(screen.getByLabelText("Fecha límite de emisión"), "2030-06-01");
    await user.tab();
    expect(screen.getByText(/ya pasó/)).toBeTruthy();
  });

  it("con todo válido muestra el primer y último número y habilita el botón", async () => {
    const user = userEvent.setup();
    render(<FormularioRango sucursales={una} hoyHN="2030-06-15" />);
    await llenarValido(user);
    expect(screen.getByTestId("vista-rango").textContent).toBe("000-001-01-00000001  →  000-001-01-00000500  (500 documentos)");
    expect(boton().disabled).toBe(false);
  });

  it("notas de crédito: el código lo escribe quien carga el rango y no puede ser 01", async () => {
    const user = userEvent.setup();
    render(<FormularioRango sucursales={una} hoyHN="2030-06-15" />);
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
    render(<FormularioRango sucursales={una} hoyHN="2030-06-15" />);
    await llenarValido(user);
    await user.click(boton());

    expect(await screen.findByText("Rango cargado.")).toBeTruthy();
    const fd = crearRango.mock.calls[0][1] as FormData;
    expect(Object.fromEntries(fd.entries())).toMatchObject({
      sucursal_id: "S1", clase: "factura", tipo_doc: "01", cai: CAI, desde: "1", hasta: "500", fecha_limite: "2099-12-31",
    });
    await waitFor(() => expect((screen.getByLabelText("CAI") as HTMLInputElement).value).toBe(""));
    expect((document.querySelector('input[name="sucursal_id"]') as HTMLInputElement).value).toBe("S1"); // sigue yendo a la única
  });

  it("muestra el error del servidor (por ejemplo un traslape) y conserva lo escrito", async () => {
    crearRango.mockResolvedValue({ ok: false, error: "Ese rango se traslapa con otro ya cargado para esta caja y este tipo de documento." });
    const user = userEvent.setup();
    render(<FormularioRango sucursales={una} hoyHN="2030-06-15" />);
    await llenarValido(user);
    await user.click(boton());
    expect(await screen.findByText(/se traslapa con otro ya cargado/)).toBeTruthy();
    expect((screen.getByLabelText("CAI") as HTMLInputElement).value).toBe(CAI);
  });

  it("avisa en vivo si el rango se traslapa con uno ya cargado y bloquea guardar", async () => {
    const user = userEvent.setup();
    render(<FormularioRango sucursales={una} hoyHN="2030-06-15" existentes={[{ sucursalId: "S1", tipoDoc: "01", desde: 400, hasta: 900 }]} />);
    await llenarValido(user); // 1-500 choca con 400-900
    expect(screen.getByText(/Se traslapa con el rango 400–900/)).toBeTruthy();
    expect(boton().disabled).toBe(true);

    const hasta = screen.getByLabelText("Hasta (número)");
    await user.clear(hasta);
    await user.type(hasta, "399");
    expect(screen.queryByText(/Se traslapa/)).toBeNull();
    expect(boton().disabled).toBe(false);
  });

  it("un rango de otro tipo de documento no cuenta como traslape", async () => {
    const user = userEvent.setup();
    render(<FormularioRango sucursales={una} hoyHN="2030-06-15" existentes={[{ sucursalId: "S1", tipoDoc: "03", desde: 1, hasta: 900 }]} />);
    await llenarValido(user);
    expect(screen.queryByText(/Se traslapa/)).toBeNull();
    expect(boton().disabled).toBe(false);
  });
});

describe("FormularioRango con VARIAS sucursales", () => {
  it("pide elegir la sucursal y muestra los números de su caja", async () => {
    const user = userEvent.setup();
    render(<FormularioRango sucursales={dos} hoyHN="2030-06-15" />);
    expect(screen.getByLabelText("Sucursal")).toBeTruthy();
    await llenarValido(user);
    expect(boton().disabled).toBe(true); // falta elegir sucursal

    await user.selectOptions(screen.getByLabelText("Sucursal"), "S2");
    expect(screen.getByTestId("vista-rango").textContent).toBe("001-001-01-00000001  →  001-001-01-00000500  (500 documentos)");
    expect(boton().disabled).toBe(false);
  });

  it("el traslape se evalúa por sucursal: el mismo rango en otra sucursal está bien", async () => {
    const user = userEvent.setup();
    render(<FormularioRango sucursales={dos} hoyHN="2030-06-15" existentes={[{ sucursalId: "S1", tipoDoc: "01", desde: 1, hasta: 500 }]} />);
    await llenarValido(user);
    await user.selectOptions(screen.getByLabelText("Sucursal"), "S1");
    expect(screen.getByText(/Se traslapa con el rango 1–500/)).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Sucursal"), "S2");
    expect(screen.queryByText(/Se traslapa/)).toBeNull();
    expect(boton().disabled).toBe(false);
  });
});
