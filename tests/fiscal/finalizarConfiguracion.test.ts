import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Supabase simulado: registra cada escritura y responde según la tabla ---
interface Op { tabla: string; tipo: "select" | "insert" | "update"; datos?: Record<string, unknown>; filtros: [string, unknown][] }
let escrituras: Op[] = [];
let sucursalesDelNegocio: { id: string }[] = [];
let cajas: Record<string, unknown>[] = [];
let fallaEn: string | null = null;

class Consulta implements PromiseLike<{ data: unknown; error: unknown }> {
  private op: Op;
  private modo: "lista" | "uno" = "lista";
  constructor(tabla: string) {
    this.op = { tabla, tipo: "select", filtros: [] };
  }
  select() {
    if (this.op.tipo !== "select") this.modoDespues = true;
    return this;
  }
  private modoDespues = false;
  insert(d: Record<string, unknown>) {
    this.op = { ...this.op, tipo: "insert", datos: d };
    return this;
  }
  update(d: Record<string, unknown>) {
    this.op = { ...this.op, tipo: "update", datos: d };
    return this;
  }
  eq(c: string, v: unknown) {
    this.op.filtros.push([c, v]);
    return this;
  }
  is(c: string, v: unknown) {
    this.op.filtros.push([c, v]);
    return this;
  }
  order() {
    return this;
  }
  maybeSingle() {
    this.modo = "uno";
    return this;
  }
  single() {
    this.modo = "uno";
    return this;
  }
  then<T1 = { data: unknown; error: unknown }, T2 = never>(
    ok?: ((v: { data: unknown; error: unknown }) => T1 | PromiseLike<T1>) | null,
    ko?: ((r: unknown) => T2 | PromiseLike<T2>) | null
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.resolver()).then(ok, ko);
  }
  private resolver(): { data: unknown; error: unknown } {
    const { tabla, tipo, datos } = this.op;
    if (tipo !== "select") escrituras.push({ ...this.op });
    if (fallaEn === tabla && tipo !== "select") return { data: null, error: { message: "fallo simulado" } };

    if (tabla === "sucursales" && tipo === "select") {
      const porId = this.op.filtros.find(([c]) => c === "id");
      if (this.modo === "uno") {
        return { data: sucursalesDelNegocio.find((s) => s.id === porId?.[1]) ?? null, error: null };
      }
      return { data: sucursalesDelNegocio, error: null };
    }
    if (tabla === "dispositivos_pos") {
      if (tipo === "select") return { data: cajas, error: null };
      if (tipo === "insert") {
        const nueva = { id: `caja-${cajas.length + 1}`, activo: true, ...datos };
        cajas.push(nueva);
        return { data: nueva, error: null };
      }
    }
    if (tabla === "datos_fiscales_emisor" && tipo === "select") return { data: null, error: null };
    return { data: null, error: null };
  }
}

vi.mock("@/lib/auth/session", () => ({ requireAdmin: async () => ({ tenant_id: "T1", id: "U1" }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: (t: string) => new Consulta(t) }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { finalizarConfiguracion, omitirConfiguracion, type DatosAsistente } from "@/app/configuracion-inicial/actions";

const CAI = "A1B2C3-D4E5F6-A1B2C3-D4E5F6-A1B2C3-D4";
const emisor = { razonSocial: "Rosa S.A.", nombreComercial: "Rosa", rtn: "0801-1999-123456", direccionFiscal: "Col. Palmira", telefono: "", correo: "" };
const rango = (sucursalId: string) => ({ sucursalId, cai: CAI, desde: "1", hasta: "500", fechaLimite: "2099-12-31" });

function datos(over: Partial<DatosAsistente> = {}): DatosAsistente {
  return {
    sucursales: [{ id: "S1", nombre: "  Rosa Centro ", telefono: " 2222-3333 ", direccion: "" }],
    factura: false,
    ...over,
  };
}

const de = (tabla: string, tipo: Op["tipo"]) => escrituras.filter((e) => e.tabla === tabla && e.tipo === tipo);

beforeEach(() => {
  escrituras = [];
  sucursalesDelNegocio = [{ id: "S1" }];
  cajas = [{ id: "caja-0", sucursal_id: "S1", establecimiento: "000", punto_emision: "001", activo: true }];
  fallaEn = null;
});

describe("finalizarConfiguracion", () => {
  it("sin facturación: guarda los datos de la sucursal (recortados), marca la configuración hecha y NO toca lo fiscal", async () => {
    const r = await finalizarConfiguracion(datos());
    expect(r).toEqual({ ok: true, activada: false, aviso: undefined });

    expect(de("sucursales", "update")[0].datos).toEqual({ nombre: "Rosa Centro", telefono: "2222-3333", direccion: null });
    expect(de("datos_fiscales_emisor", "insert")).toHaveLength(0);
    expect(de("cai_rangos", "insert")).toHaveLength(0);
    const tenant = de("tenants", "update");
    expect(tenant).toHaveLength(1);
    expect(Object.keys(tenant[0].datos!)).toEqual(["configuracion_inicial_at"]); // no activa la facturación
  });

  it("con CAI: guarda emisor y rango en la caja de la sucursal, ACTIVA la facturación y marca la configuración hecha", async () => {
    const r = await finalizarConfiguracion(datos({ factura: true, emisor, rangos: [rango("S1")] }));
    expect(r).toMatchObject({ ok: true, activada: true });

    expect(de("datos_fiscales_emisor", "insert")[0].datos).toMatchObject({
      tenant_id: "T1", sucursal_id: null, razon_social: "Rosa S.A.", rtn: "08011999123456", direccion_fiscal: "Col. Palmira",
    });
    expect(de("cai_rangos", "insert")[0].datos).toMatchObject({
      tenant_id: "T1", sucursal_id: "S1", establecimiento: "000", punto_emision: "001", tipo_doc: "01", clase: "factura",
      cai: CAI, desde: 1, hasta: 500, siguiente: 1, fecha_limite: "2099-12-31", dispositivo_id: "caja-0",
    });
    const tenants = de("tenants", "update").map((t) => t.datos);
    expect(tenants[0]).toEqual({ facturacion_fiscal_activa: true });
    expect(tenants[1]).toHaveProperty("configuracion_inicial_at");
  });

  it("si una sucursal no tiene su CAI, NO activa la facturación (bloquearía su cobro) y avisa cuál falta", async () => {
    sucursalesDelNegocio = [{ id: "S1" }, { id: "S2" }];
    const r = await finalizarConfiguracion(
      datos({
        sucursales: [
          { id: "S1", nombre: "Centro", telefono: "", direccion: "" },
          { id: "S2", nombre: "Norte", telefono: "", direccion: "" },
        ],
        factura: true,
        emisor,
        rangos: [rango("S1"), { sucursalId: "S2", cai: "", desde: "", hasta: "", fechaLimite: "" }],
      })
    );
    expect(r.ok).toBe(true);
    expect(r.activada).toBe(false);
    expect(r.aviso).toMatch(/Falta el CAI de Norte/);
    expect(de("cai_rangos", "insert")).toHaveLength(1);
    expect(de("tenants", "update").some((t) => "facturacion_fiscal_activa" in t.datos!)).toBe(false);
  });

  it("valida TODO antes de escribir: un CAI inválido no deja nada guardado", async () => {
    const r = await finalizarConfiguracion(
      datos({ factura: true, emisor, rangos: [{ ...rango("S1"), cai: "no-es-un-cai" }] })
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/CAI: Formato inválido/);
    expect(escrituras).toHaveLength(0);
  });

  it("rechaza datos fiscales incompletos o RTN inválido sin escribir nada", async () => {
    const mal = await finalizarConfiguracion(datos({ factura: true, emisor: { ...emisor, rtn: "123" }, rangos: [rango("S1")] }));
    expect(mal).toMatchObject({ ok: false });
    expect(mal.error).toMatch(/RTN/);
    const sinEmisor = await finalizarConfiguracion(datos({ factura: true, rangos: [rango("S1")] }));
    expect(sinEmisor.ok).toBe(false);
    expect(escrituras).toHaveLength(0);
  });

  it("si factura debe cargar al menos un CAI", async () => {
    const r = await finalizarConfiguracion(datos({ factura: true, emisor, rangos: [] }));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/al menos una sucursal|No facturo con CAI/);
    expect(escrituras).toHaveLength(0);
  });

  it("rechaza fechas límite vencidas y sucursales sin nombre", async () => {
    const vencido = await finalizarConfiguracion(datos({ factura: true, emisor, rangos: [{ ...rango("S1"), fechaLimite: "2020-01-01" }] }));
    expect(vencido.error).toMatch(/ya pasó/);
    const sinNombre = await finalizarConfiguracion(datos({ sucursales: [{ id: "S1", nombre: "  ", telefono: "", direccion: "" }] }));
    expect(sinNombre.ok).toBe(false);
    expect(escrituras).toHaveLength(0);
  });

  it("ignora sucursales que no son del negocio (no se pueden tocar las de otro)", async () => {
    const r = await finalizarConfiguracion(
      datos({ sucursales: [{ id: "AJENA", nombre: "Hackeada", telefono: "", direccion: "" }] })
    );
    expect(r.ok).toBe(false); // ninguna sucursal propia
    expect(de("sucursales", "update")).toHaveLength(0);
  });

  it("si falla al guardar devuelve el error y NO marca la configuración como hecha", async () => {
    fallaEn = "cai_rangos";
    const r = await finalizarConfiguracion(datos({ factura: true, emisor, rangos: [rango("S1")] }));
    expect(r.ok).toBe(false);
    expect(de("tenants", "update")).toHaveLength(0);
  });

  it("crea la caja de la sucursal si por algún motivo no existía", async () => {
    cajas = [];
    await finalizarConfiguracion(datos({ factura: true, emisor, rangos: [rango("S1")] }));
    expect(de("dispositivos_pos", "insert")[0].datos).toMatchObject({ sucursal_id: "S1", establecimiento: "000", punto_emision: "001" });
    expect(de("cai_rangos", "insert")[0].datos).toMatchObject({ dispositivo_id: "caja-1" });
  });
});

describe("omitirConfiguracion", () => {
  it("marca la configuración como hecha, no guarda nada más y manda al panel", async () => {
    await expect(omitirConfiguracion()).rejects.toThrow("REDIRECT:/admin");
    expect(escrituras).toHaveLength(1);
    expect(escrituras[0]).toMatchObject({ tabla: "tenants", tipo: "update" });
    expect(Object.keys(escrituras[0].datos!)).toEqual(["configuracion_inicial_at"]);
  });
});
