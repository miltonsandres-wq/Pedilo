import { describe, it, expect } from "vitest";
import {
  validarEntradaRango, validarEmisor, type EntradaRango,
} from "@/lib/fiscal/validaciones";
import { armarLibro, libroACsv, type DocumentoLibro } from "@/lib/fiscal/libro";
import { alertasPorPunto, type RangoParaAlerta } from "@/lib/fiscal/alertas";
import { formatearFechaHora } from "@/lib/fiscal/formato";

const HOY = "2030-06-15";
const CAI = "A1B2C3-D4E5F6-A1B2C3-D4E5F6-A1B2C3-D4";

function entrada(over: Partial<EntradaRango> = {}): EntradaRango {
  return { clase: "factura", tipoDoc: "01", cai: CAI, desde: "1", hasta: "500", fechaLimite: "2030-12-31", sucursalId: "S1", ...over };
}

describe("validarEntradaRango", () => {
  it("acepta un rango válido y normaliza (CAI en mayúsculas, números)", () => {
    const r = validarEntradaRango(entrada({ cai: CAI.toLowerCase() }), HOY);
    expect(r.ok).toBe(true);
    expect(r.valor).toEqual({ clase: "factura", tipoDoc: "01", cai: CAI, desde: 1, hasta: 500, fechaLimite: "2030-12-31", sucursalId: "S1" });
  });

  it("valida el formato del CAI en vivo", () => {
    expect(validarEntradaRango(entrada({ cai: "ABC" }), HOY).errores.cai).toMatch(/Formato inválido/);
    expect(validarEntradaRango(entrada({ cai: "" }), HOY).errores.cai).toMatch(/Escribe el CAI/);
    expect(validarEntradaRango(entrada({ cai: "Z1B2C3-D4E5F6-A1B2C3-D4E5F6-A1B2C3-D4" }), HOY).ok).toBe(false);
  });

  it("valida desde/hasta", () => {
    expect(validarEntradaRango(entrada({ desde: "10", hasta: "5" }), HOY).errores.hasta).toMatch(/mayor/);
    expect(validarEntradaRango(entrada({ desde: "0", hasta: "5" }), HOY).errores.hasta).toBeTruthy();
    expect(validarEntradaRango(entrada({ desde: "", hasta: "" }), HOY).errores).toMatchObject({ desde: expect.any(String), hasta: expect.any(String) });
  });

  it("rechaza fecha límite vencida; acepta la de hoy", () => {
    expect(validarEntradaRango(entrada({ fechaLimite: "2030-06-14" }), HOY).errores.fechaLimite).toMatch(/ya pasó/);
    expect(validarEntradaRango(entrada({ fechaLimite: "2030-06-15" }), HOY).ok).toBe(true);
    expect(validarEntradaRango(entrada({ fechaLimite: "" }), HOY).errores.fechaLimite).toBeTruthy();
  });

  it("la factura es siempre 01; las notas usan el código configurable que da el SAR", () => {
    expect(validarEntradaRango(entrada({ tipoDoc: "03" }), HOY).errores.tipoDoc).toMatch(/01/);
    expect(validarEntradaRango(entrada({ clase: "nota_credito", tipoDoc: "01" }), HOY).errores.tipoDoc).toMatch(/factura/);
    const nc = validarEntradaRango(entrada({ clase: "nota_credito", tipoDoc: "03" }), HOY);
    expect(nc.ok).toBe(true);
    expect(nc.valor?.tipoDoc).toBe("03");
    // cualquier otro código de 2 dígitos vale: no hay códigos de nota hardcodeados
    expect(validarEntradaRango(entrada({ clase: "nota_debito", tipoDoc: "07" }), HOY).ok).toBe(true);
    expect(validarEntradaRango(entrada({ tipoDoc: "1" }), HOY).errores.tipoDoc).toMatch(/2 dígitos/);
  });

  it("exige la sucursal", () => {
    expect(validarEntradaRango(entrada({ sucursalId: "" }), HOY).errores.sucursalId).toBeTruthy();
  });
});

describe("validarEmisor", () => {
  const base = { razonSocial: "Rosa S.A.", nombreComercial: "", rtn: "0801-1999-123456", direccionFiscal: "Col. Palmira", telefono: "", correo: "" };
  it("del negocio: razón social, RTN y dirección obligatorios; RTN de 14 dígitos", () => {
    expect(validarEmisor(base).ok).toBe(true);
    expect(validarEmisor(base).valor?.rtn).toBe("08011999123456");
    expect(validarEmisor({ ...base, razonSocial: "", rtn: "", direccionFiscal: "" }).errores).toMatchObject({
      razonSocial: expect.any(String), rtn: expect.any(String), direccionFiscal: expect.any(String),
    });
    expect(validarEmisor({ ...base, rtn: "123" }).errores.rtn).toMatch(/14 dígitos/);
    expect(validarEmisor({ ...base, correo: "no-es-correo" }).errores.correo).toBeTruthy();
  });
  it("override de sucursal: todo opcional (lo vacío hereda), pero si hay RTN debe ser válido", () => {
    const vacio = { razonSocial: "", nombreComercial: "", rtn: "", direccionFiscal: "", telefono: "", correo: "" };
    expect(validarEmisor(vacio, { esOverrideDeSucursal: true }).ok).toBe(true);
    expect(validarEmisor({ ...vacio, rtn: "12" }, { esOverrideDeSucursal: true }).errores.rtn).toBeTruthy();
  });
});

describe("alertasPorPunto", () => {
  function r(over: Partial<RangoParaAlerta> = {}): RangoParaAlerta {
    return { id: "r1", sucursal_id: "S1", establecimiento: "001", punto_emision: "001", tipo_doc: "01", clase: "factura", desde: 1, hasta: 100, siguiente: 10, fecha_limite: "2031-01-01", estado: "activo", ...over };
  }
  const nivel = (l: RangoParaAlerta[]) => alertasPorPunto(l, HOY).map((a) => a.nivel);

  it("agrupa por sucursal + punto + tipo", () => {
    const a = alertasPorPunto([r(), r({ id: "r2", punto_emision: "002" }), r({ id: "r3", tipo_doc: "03", clase: "nota_credito" })], HOY);
    expect(a).toHaveLength(3);
  });
  it("ok / 85% / vencimiento / agotado / vencido", () => {
    expect(nivel([r()])).toEqual(["ok"]);
    expect(nivel([r({ siguiente: 90 })])).toEqual(["consumo"]);
    expect(nivel([r({ fecha_limite: "2030-07-01" })])).toEqual(["vencimiento"]);
    expect(nivel([r({ siguiente: 101, estado: "agotado" })])).toEqual(["agotado"]);
    expect(nivel([r({ fecha_limite: "2030-06-01", estado: "vencido" })])).toEqual(["vencido"]);
  });
  it("con un relevo vigente, un rango agotado no bloquea el punto", () => {
    const l = [r({ siguiente: 101, estado: "agotado" }), r({ id: "r2", desde: 101, hasta: 200, siguiente: 101, estado: "pendiente" })];
    expect(nivel(l)).toEqual(["ok"]);
  });
  it("marca si hay relevo cargado detrás de un activo casi consumido", () => {
    const [a] = alertasPorPunto([r({ siguiente: 95 }), r({ id: "r2", desde: 101, hasta: 200, siguiente: 101, estado: "pendiente" })], HOY);
    expect(a).toMatchObject({ nivel: "consumo", hayRelevo: true });
  });
  it("un relevo vencido no cuenta como relevo", () => {
    const l = [r({ siguiente: 101, estado: "agotado" }), r({ id: "r2", desde: 101, hasta: 200, siguiente: 101, estado: "pendiente", fecha_limite: "2030-01-01" })];
    expect(nivel(l)).toEqual(["vencido"]);
  });
});

describe("libro de ventas", () => {
  function d(over: Partial<DocumentoLibro> = {}): DocumentoLibro {
    return {
      id: crypto.randomUUID(), fecha_emision: "2030-06-15T18:00:00Z", numero_completo: "001-001-01-00000001", clase: "factura",
      estado: "emitida", cliente_nombre: "Consumidor Final", cliente_rtn: null, importe_exonerado: 0, importe_exento: 50,
      gravado_15: 200, gravado_18: 100, isv_15: 30, isv_18: 18, cargo_servicio: 0, total: 398, anulada_motivo: null, ...over,
    };
  }

  it("suma por tasa solo lo vigente, cuenta anuladas aparte, y las notas de crédito restan", () => {
    const libro = armarLibro([
      d({ numero_completo: "001-001-01-00000001" }),
      d({ numero_completo: "001-001-01-00000002" }),
      d({ numero_completo: "001-001-01-00000003", estado: "anulada", anulada_motivo: "Error" }),
      d({ numero_completo: "001-001-03-00000001", clase: "nota_credito", importe_exento: 0, gravado_15: 100, gravado_18: 0, isv_15: 15, isv_18: 0, total: 115 }),
    ]);
    expect(libro.cantidadEmitidos).toBe(3);
    expect(libro.cantidadAnulados).toBe(1);
    expect(libro.totales).toMatchObject({ importe_exento: 100, gravado_15: 300, gravado_18: 200, isv_15: 45, isv_18: 36, total: 681 });
  });

  it("los totales suman exacto en centavos (sin errores de coma flotante)", () => {
    const docs = Array.from({ length: 10 }, (_, i) => d({ numero_completo: `001-001-01-${String(i + 1).padStart(8, "0")}`, total: 0.1, gravado_15: 0.09, isv_15: 0.01, importe_exento: 0, gravado_18: 0, isv_18: 0 }));
    expect(armarLibro(docs).totales.total).toBe(1);
  });

  it("ordena por fecha y número", () => {
    const libro = armarLibro([d({ fecha_emision: "2030-06-16T10:00:00Z", numero_completo: "B" }), d({ fecha_emision: "2030-06-15T10:00:00Z", numero_completo: "A" })]);
    expect(libro.documentos.map((x) => x.numero_completo)).toEqual(["A", "B"]);
  });

  describe("CSV", () => {
    const fmt = (iso: string) => formatearFechaHora(new Date(iso));
    it("incluye TODOS los documentos (anulados también), encabezado, fila de totales y BOM para Excel", () => {
      const csv = libroACsv(armarLibro([d(), d({ numero_completo: "001-001-01-00000002", estado: "anulada", anulada_motivo: "Cliente se retiró, no pagó" })]), fmt);
      expect(csv.charCodeAt(0)).toBe(0xfeff);
      const filas = csv.slice(1).trimEnd().split("\r\n");
      expect(filas).toHaveLength(4); // encabezado + 2 documentos + totales
      expect(filas[0]).toContain("Importe exonerado");
      expect(filas[1]).toContain("001-001-01-00000001");
      expect(filas[2]).toContain("Anulada");
      expect(filas[2]).toContain('"Cliente se retiró, no pagó"'); // coma dentro del texto: entre comillas
      expect(filas[3]).toContain("TOTALES");
      expect(filas[3]).toContain("398.00"); // solo la vigente
    });
    it("las notas de crédito salen con importes negativos", () => {
      const csv = libroACsv(armarLibro([d({ clase: "nota_credito", numero_completo: "001-001-03-00000001", total: 115, gravado_15: 100, isv_15: 15, importe_exento: 0, gravado_18: 0, isv_18: 0 })]), fmt);
      expect(csv).toContain("-115.00");
      expect(csv).toContain("Nota de crédito");
    });
    it("neutraliza texto que Excel interpretaría como fórmula", () => {
      const csv = libroACsv(armarLibro([d({ cliente_nombre: '=HYPERLINK("http://x")' })]), fmt);
      expect(csv).toContain("'=HYPERLINK");
      expect(csv).not.toMatch(/,=HYPERLINK/);
    });
    it("periodo vacío: solo encabezado y totales en cero", () => {
      const filas = libroACsv(armarLibro([]), fmt).slice(1).trimEnd().split("\r\n");
      expect(filas).toHaveLength(2);
      expect(filas[1]).toContain("0.00");
    });
  });
});

import { calcularRequisitos } from "@/lib/fiscal/requisitos";
import { limitesPeriodoHN, primerDiaDelMes } from "@/lib/fiscal/formato";

describe("calcularRequisitos (activar la facturación)", () => {
  const sucursales = [{ id: "S1", nombre: "Centro" }, { id: "S2", nombre: "Norte" }];
  const emisorBase = { sucursal_id: null, razon_social: "Rosa S.A.", rtn: "08019999123456", direccion_fiscal: "Col. Palmira" };
  const rango = (s: string, over = {}) => ({ sucursal_id: s, clase: "factura", estado: "activo", siguiente: 1, hasta: 100, fecha_limite: "2030-12-31", ...over });
  const cumple = (r: ReturnType<typeof calcularRequisitos>) => r.every((x) => x.cumple);

  it("todo listo en todas las sucursales activas", () => {
    const r = calcularRequisitos({ sucursales, emisores: [emisorBase], rangos: [rango("S1"), rango("S2")] }, "2030-06-15");
    expect(cumple(r)).toBe(true);
  });

  it("señala qué falta y en qué sucursal", () => {
    const r = calcularRequisitos({ sucursales, emisores: [], rangos: [rango("S1", { estado: "agotado" })] }, "2030-06-15");
    const faltan = r.filter((x) => !x.cumple).map((x) => x.texto);
    expect(faltan).toEqual(expect.arrayContaining([
      expect.stringMatching(/Centro: faltan datos fiscales.*razón social, RTN, dirección fiscal/),
      expect.stringMatching(/Centro: carga un CAI vigente/),
      expect.stringMatching(/Norte: faltan datos fiscales/),
      expect.stringMatching(/Norte: carga un CAI vigente/),
    ]));
    expect(faltan.join(" ")).not.toMatch(/caja/i); // la caja se crea sola: ya no se le pide al dueño
  });

  it("los datos propios de una sucursal heredan lo que dejan vacío del negocio", () => {
    const r = calcularRequisitos(
      { sucursales: [sucursales[0]], emisores: [emisorBase, { sucursal_id: "S1", razon_social: "Otra S.A.", rtn: null, direccion_fiscal: null }], rangos: [rango("S1")] },
      "2030-06-15"
    );
    expect(cumple(r)).toBe(true);
  });

  it("un CAI vencido, agotado o de otro tipo de documento no cuenta", () => {
    const base = { sucursales: [sucursales[0]], emisores: [emisorBase] };
    expect(cumple(calcularRequisitos({ ...base, rangos: [rango("S1", { fecha_limite: "2030-06-14" })] }, "2030-06-15"))).toBe(false);
    expect(cumple(calcularRequisitos({ ...base, rangos: [rango("S1", { siguiente: 101 })] }, "2030-06-15"))).toBe(false);
    expect(cumple(calcularRequisitos({ ...base, rangos: [rango("S1", { clase: "nota_credito" })] }, "2030-06-15"))).toBe(false);
    expect(cumple(calcularRequisitos({ ...base, rangos: [rango("S1", { estado: "pendiente" })] }, "2030-06-15"))).toBe(true);
  });

  it("sin sucursales no se puede activar", () => {
    expect(cumple(calcularRequisitos({ sucursales: [], emisores: [], rangos: [] }, "2030-06-15"))).toBe(false);
  });
});

describe("periodo del libro en hora de Honduras", () => {
  it("un día local empieza a las 06:00 UTC y el periodo incluye el día final completo", () => {
    expect(limitesPeriodoHN("2030-06-01", "2030-06-30")).toEqual({
      inicioIso: "2030-06-01T06:00:00.000Z",
      finIso: "2030-07-01T06:00:00.000Z",
    });
  });
  it("cruza fin de año", () => {
    expect(limitesPeriodoHN("2030-12-31", "2030-12-31").finIso).toBe("2031-01-01T06:00:00.000Z");
  });
  it("primer día del mes", () => {
    expect(primerDiaDelMes("2030-06-15")).toBe("2030-06-01");
  });
});
