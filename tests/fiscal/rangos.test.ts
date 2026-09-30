import { describe, it, expect } from "vitest";
import { planificarEmision, fusionarRango, FiscalError, type RangoPlanificable } from "@/lib/fiscal/rangos";

const HOY = new Date("2030-06-15T18:00:00Z"); // 12:00 en Honduras

function rango(over: Partial<RangoPlanificable> = {}): RangoPlanificable {
  return {
    id: "r1", clase: "factura", tipo_doc: "01", desde: 1, hasta: 3, siguiente: 1,
    fecha_limite: "2030-12-31", estado: "activo", ...over,
  };
}

function falla(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    return e as FiscalError;
  }
  throw new Error("se esperaba un FiscalError");
}

describe("planificarEmision", () => {
  it("usa el rango activo y avanza el siguiente", () => {
    const plan = planificarEmision([rango({ siguiente: 2 })], "factura", HOY);
    expect(plan.correlativo).toBe(2);
    expect(plan.cambios.r1).toEqual({ estado: "activo", siguiente: 3 });
  });

  it("al usar el último número el rango pasa a agotado y se activa el pendiente de menor desde", () => {
    const plan = planificarEmision(
      [
        rango({ siguiente: 3 }),
        rango({ id: "r3", desde: 200, hasta: 300, siguiente: 200, estado: "pendiente" }),
        rango({ id: "r2", desde: 4, hasta: 100, siguiente: 4, estado: "pendiente" }),
      ],
      "factura",
      HOY
    );
    expect(plan.correlativo).toBe(3);
    expect(plan.cambios.r1).toEqual({ estado: "agotado", siguiente: 4 });
    expect(plan.cambios.r2).toEqual({ estado: "activo" });
    expect(plan.cambios.r3).toBeUndefined();
  });

  it("si el activo ya se agotó, activa el pendiente y emite de ahí", () => {
    const plan = planificarEmision(
      [rango({ siguiente: 4, estado: "activo" }), rango({ id: "r2", desde: 4, hasta: 10, siguiente: 4, estado: "pendiente" })],
      "factura",
      HOY
    );
    expect(plan.rango.id).toBe("r2");
    expect(plan.correlativo).toBe(4);
    expect(plan.cambios.r1).toEqual({ estado: "agotado" });
    expect(plan.cambios.r2).toEqual({ estado: "activo", siguiente: 5 });
  });

  it("si el activo venció, pasa al pendiente vigente", () => {
    const plan = planificarEmision(
      [
        rango({ fecha_limite: "2030-06-14" }),
        rango({ id: "r2", desde: 4, hasta: 10, siguiente: 4, estado: "pendiente" }),
      ],
      "factura",
      HOY
    );
    expect(plan.rango.id).toBe("r2");
    expect(plan.cambios.r1).toEqual({ estado: "vencido" });
  });

  it("BLOQUEA sin rango: no hay modo permisivo", () => {
    const e = falla(() => planificarEmision([], "factura", HOY));
    expect(e.codigo).toBe("sin_rango");
    // hay rangos, pero de otra clase (solo notas de crédito): tampoco sirve para facturar
    expect(falla(() => planificarEmision([rango({ clase: "nota_credito" })], "factura", HOY)).codigo).toBe("sin_rango");
  });

  it("BLOQUEA con el rango agotado", () => {
    expect(falla(() => planificarEmision([rango({ siguiente: 4, estado: "agotado" })], "factura", HOY)).codigo).toBe("rango_agotado");
    expect(falla(() => planificarEmision([rango({ siguiente: 4 })], "factura", HOY)).codigo).toBe("rango_agotado");
  });

  it("BLOQUEA con la fecha vencida, y el último día sigue valiendo hasta el final del día local", () => {
    const e = falla(() => planificarEmision([rango({ fecha_limite: "2030-06-14" })], "factura", HOY));
    expect(e.codigo).toBe("rango_vencido");
    expect(e.message).toContain("14/06/2030");
    // 2030-06-16T05:59Z = 15/06 23:59 en Honduras: todavía cuenta como el último día
    const ultimoInstante = new Date("2030-06-16T05:59:59Z");
    expect(planificarEmision([rango({ fecha_limite: "2030-06-15" })], "factura", ultimoInstante).correlativo).toBe(1);
    expect(falla(() => planificarEmision([rango({ fecha_limite: "2030-06-15" })], "factura", new Date("2030-06-16T06:00:00Z"))).codigo).toBe("rango_vencido");
  });

  it("un rango pendiente vencido no se activa", () => {
    const e = falla(() =>
      planificarEmision(
        [rango({ siguiente: 4, estado: "agotado" }), rango({ id: "r2", desde: 4, hasta: 9, siguiente: 4, estado: "pendiente", fecha_limite: "2030-01-01" })],
        "factura",
        HOY
      )
    );
    expect(e.codigo).toBe("rango_vencido");
  });

  it("notas de crédito usan sus propios rangos y su propio tipo_doc", () => {
    const plan = planificarEmision(
      [rango(), rango({ id: "nc", clase: "nota_credito", tipo_doc: "03", desde: 10, hasta: 20, siguiente: 10 })],
      "nota_credito",
      HOY
    );
    expect(plan.rango.id).toBe("nc");
    expect(plan.correlativo).toBe(10);
  });
});

describe("fusionarRango (protección contra reuso)", () => {
  const remoto = rango({ siguiente: 1 });

  it("nunca baja el correlativo local", () => {
    expect(fusionarRango(rango({ siguiente: 7, hasta: 100 }), rango({ siguiente: 3, hasta: 100 }), 0).siguiente).toBe(7);
  });

  it("dispositivo nuevo/reinstalado: arranca en max(servidor) + 1", () => {
    const r = fusionarRango(undefined, rango({ hasta: 100, siguiente: 1 }), 41);
    expect(r.siguiente).toBe(42);
  });

  it("usa el mayor entre local, servidor y máximo emitido + 1", () => {
    expect(fusionarRango(rango({ hasta: 100, siguiente: 5 }), rango({ hasta: 100, siguiente: 30 }), 10).siguiente).toBe(30);
    expect(fusionarRango(rango({ hasta: 100, siguiente: 5 }), rango({ hasta: 100, siguiente: 8 }), 50).siguiente).toBe(51);
  });

  it("si lo emitido ya cubre todo el rango queda agotado", () => {
    expect(fusionarRango(undefined, remoto, 3)).toMatchObject({ siguiente: 4, estado: "agotado" });
  });

  it("un rango posterior al máximo emitido arranca en su desde; uno anterior queda agotado", () => {
    expect(fusionarRango(undefined, rango({ desde: 500, hasta: 600, siguiente: 500, estado: "pendiente" }), 41).siguiente).toBe(500);
    expect(fusionarRango(undefined, rango({ desde: 1, hasta: 40, siguiente: 1 }), 41)).toMatchObject({ siguiente: 41, estado: "agotado" });
  });

  it("conserva 'activo' si este dispositivo ya usó un rango que el servidor aún ve pendiente", () => {
    const local = rango({ id: "r2", desde: 4, hasta: 10, siguiente: 6, estado: "activo" });
    const srv = rango({ id: "r2", desde: 4, hasta: 10, siguiente: 4, estado: "pendiente" });
    expect(fusionarRango(local, srv, 3)).toMatchObject({ siguiente: 6, estado: "activo" });
  });
});
