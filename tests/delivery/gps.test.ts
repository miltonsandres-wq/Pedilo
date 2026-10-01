import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  crearDetectorLlegada, crearMuestreoRastro, crearThrottle, MUESTREO_RASTRO_MS, THROTTLE_POR_DEFECTO,
  type CallbacksUbicacion, type EstadoPermiso, type Lectura, type ProveedorUbicacion,
} from "@/lib/location";
import { ControladorRastreo, type CanalesRastreo, type EstadoRastreo } from "@/lib/repartidor/rastreo";
import { abrirBaseRepartidor, type BaseRepartidor, type PedidoRep } from "@/lib/repartidor/db";
import { enlaceGoogleMaps, enlaceLlamar, enlaceWaze, enlaceWhatsapp } from "@/lib/repartidor/enlaces";
import { firmarJwtRepartidor, verificarJwtRepartidor, DURACION_TURNO_S } from "@/lib/repartidor/jwt";

const CASA = { lat: 14.0723, lng: -87.1921 };
// ~11.1 m por 0.0001° de latitud
const al_norte = (metros: number) => ({ lat: CASA.lat + metros / 111_320, lng: CASA.lng });
const lectura = (t: number, p = { ...CASA }, precisionM: number | null = 10): Lectura => ({ ...p, precisionM, velocidad: 5, t });

describe("throttling del GPS", () => {
  it("publica la primera, omite las cercanas en tiempo y distancia, y publica a los 12 s", () => {
    const th = crearThrottle();
    expect(th.evaluar(lectura(0))).toBe("publicar");
    expect(th.evaluar(lectura(3_000, al_norte(5)))).toBe("omitir");
    expect(th.evaluar(lectura(11_999, al_norte(10)))).toBe("omitir");
    expect(th.evaluar(lectura(12_000, al_norte(10)))).toBe("publicar");
  });

  it("publica antes de tiempo si se movió ~50 m", () => {
    const th = crearThrottle();
    th.evaluar(lectura(0));
    expect(th.evaluar(lectura(2_000, al_norte(49)))).toBe("omitir");
    expect(th.evaluar(lectura(3_000, al_norte(55)))).toBe("publicar");
    // la referencia ahora es esa posición, no la primera
    expect(th.evaluar(lectura(4_000, al_norte(60)))).toBe("omitir");
  });

  it("descarta lecturas con precisión peor a 100 m y acepta la que no informa precisión", () => {
    const th = crearThrottle();
    expect(th.evaluar(lectura(0, CASA, 101))).toBe("descartar_precision");
    expect(th.evaluar(lectura(1, CASA, 100))).toBe("publicar");
    expect(crearThrottle().evaluar(lectura(0, CASA, null))).toBe("publicar");
    // una lectura descartada no cuenta como "última publicada"
    const t2 = crearThrottle();
    t2.evaluar(lectura(0));
    t2.evaluar(lectura(20_000, al_norte(500), 300));
    expect(t2.evaluar(lectura(20_001, al_norte(500), 20))).toBe("publicar");
  });

  it("reiniciar hace que la próxima lectura válida se publique sin esperar", () => {
    const th = crearThrottle();
    th.evaluar(lectura(0));
    th.reiniciar();
    expect(th.evaluar(lectura(100))).toBe("publicar");
  });

  it("valores por omisión: 12 s, 50 m, 100 m", () => {
    expect(THROTTLE_POR_DEFECTO).toEqual({ intervaloMs: 12_000, distanciaM: 50, precisionMaxM: 100 });
  });
});

describe("muestreo del rastro y llegada automática", () => {
  it("guarda ~1 punto por minuto", () => {
    const m = crearMuestreoRastro();
    expect([0, 20_000, 59_999, MUESTREO_RASTRO_MS, MUESTREO_RASTRO_MS + 1, 125_000].map((t) => m.tocaMuestrear(t))).toEqual([true, false, false, true, false, true]);
  });

  it("llegada: exige lecturas seguidas dentro del radio y avisa UNA sola vez", () => {
    const d = crearDetectorLlegada(100, 2);
    expect(d.actualizar(lectura(0, al_norte(300)), CASA)).toBe(false);
    expect(d.actualizar(lectura(1, al_norte(90)), CASA)).toBe(false); // una sola puede ser un salto del GPS
    expect(d.actualizar(lectura(2, al_norte(80)), CASA)).toBe(true);
    expect(d.actualizar(lectura(3, al_norte(10)), CASA)).toBe(false);
  });

  it("una lectura fuera del radio reinicia la cuenta; sin pin no hay llegada", () => {
    const d = crearDetectorLlegada(100, 2);
    d.actualizar(lectura(0, al_norte(50)), CASA);
    d.actualizar(lectura(1, al_norte(400)), CASA);
    expect(d.actualizar(lectura(2, al_norte(50)), CASA)).toBe(false);
    expect(crearDetectorLlegada().actualizar(lectura(0), null)).toBe(false);
  });

  it("el radio es configurable y una lectura imprecisa no cuenta", () => {
    const d = crearDetectorLlegada(200, 1);
    expect(d.actualizar(lectura(0, al_norte(150)), CASA)).toBe(true);
    const e = crearDetectorLlegada(100, 1);
    expect(e.actualizar(lectura(0, CASA, 150), CASA)).toBe(false);
  });
});

// --- controlador ------------------------------------------------------------

class ProveedorFalso implements ProveedorUbicacion {
  cb: CallbacksUbicacion | null = null;
  inicios = 0;
  detenciones = 0;
  soportado() { return true; }
  async permiso(): Promise<EstadoPermiso> { return "concedido"; }
  iniciar(cb: CallbacksUbicacion) { this.cb = cb; this.inicios++; }
  detener() { if (this.cb) this.detenciones++; this.cb = null; }
  activo() { return this.cb != null; }
  emitir(l: Lectura) { this.cb?.onLectura(l); }
  fallar(tipo: "permiso_denegado" | "gps_apagado" | "sin_senal") { this.cb?.onError({ tipo, mensaje: tipo }); }
}

const pedido = (id: string, over: Partial<PedidoRep> = {}): PedidoRep => ({
  orden_id: id, sucursal_id: "S", numero: 1, cliente_nombre: "Ana", cliente_telefono: "99887766", direccion_referencia: "Casa azul",
  zona_nombre: null, destino_lat: CASA.lat, destino_lng: CASA.lng, metodo_pago: "efectivo", paga_con: null, tarifa_envio: 30,
  subtotal: 100, total: 130, items: [], estado_delivery: "en_camino", tracking_token: `tok-${id}`, en_camino_at: null,
  llegado_at: null, llegada_automatica: false, entregado_at: null, monto_cobrado: null, entrega_lat: null, entrega_lng: null,
  conflicto: null, ...over,
});

describe("ControladorRastreo", () => {
  let base: BaseRepartidor;
  let prov: ProveedorFalso;
  let publicadas: { lectura: Lectura; ordenes: string[] }[];
  let estados: EstadoRastreo[];
  let cerrados: number;
  let llegadas: string[];
  let wake: { activar: number; liberar: number };
  let ctl: ControladorRastreo;

  beforeEach(async () => {
    base = abrirBaseRepartidor(`rep-${Math.random()}`);
    prov = new ProveedorFalso();
    publicadas = []; estados = []; llegadas = []; cerrados = 0; wake = { activar: 0, liberar: 0 };
    const canales: CanalesRastreo = {
      publicarPosicion: ({ lectura: l, pedidos }) => publicadas.push({ lectura: l, ordenes: pedidos.map((p) => p.ordenId) }),
      publicarEstado: () => undefined,
      cerrar: () => { cerrados++; },
    };
    ctl = new ControladorRastreo({
      proveedor: prov, base, canales, repartidorId: "R1", radioLlegadaM: 100,
      alLlegar: (id) => { llegadas.push(id); },
      alCambiarEstado: (e) => estados.push(e),
      wakeLock: { activar: async () => { wake.activar++; return true; }, liberar: async () => { wake.liberar++; } },
    });
  });

  const espera = () => ctl.esperar();

  it("enciende el GPS y la pantalla SOLO con un pedido en camino, y los apaga al entregar el último", () => {
    ctl.actualizarPedidos([pedido("A", { estado_delivery: "listo" })]);
    expect(prov.activo()).toBe(false);

    ctl.actualizarPedidos([pedido("A"), pedido("B")]);
    expect(prov.activo()).toBe(true);
    expect(wake.activar).toBe(1);

    ctl.actualizarPedidos([pedido("A", { estado_delivery: "entregado" }), pedido("B")]); // queda B
    expect(prov.activo()).toBe(true);

    ctl.actualizarPedidos([pedido("A", { estado_delivery: "entregado" }), pedido("B", { estado_delivery: "entregado" })]);
    expect(prov.activo()).toBe(false);
    expect(wake.liberar).toBe(1);
    expect(cerrados).toBe(1);
    expect(ctl.estadoActual).toBe("inactivo");
  });

  it("publica con throttling a los canales de los pedidos en camino", async () => {
    ctl.actualizarPedidos([pedido("A"), pedido("B")]);
    prov.emitir(lectura(0, al_norte(1000)));
    prov.emitir(lectura(2_000, al_norte(1005)));
    prov.emitir(lectura(13_000, al_norte(1010)));
    await espera();
    expect(publicadas.map((p) => p.lectura.t)).toEqual([0, 13_000]);
    expect(publicadas[0].ordenes).toEqual(["A", "B"]);
  });

  it("no publica ni guarda lecturas imprecisas", async () => {
    ctl.actualizarPedidos([pedido("A")]);
    prov.emitir(lectura(0, al_norte(1000), 250));
    await espera();
    expect(publicadas).toHaveLength(0);
    expect(await base.rastro.count()).toBe(0);
    expect(ctl.ultimaLectura).toBeNull();
  });

  it("guarda ~1 punto por minuto por pedido, NO cada lectura", async () => {
    ctl.actualizarPedidos([pedido("A"), pedido("B")]);
    for (let t = 0; t <= 130_000; t += 15_000) prov.emitir(lectura(t, al_norte(1000 + t / 100)));
    await espera();
    const pts = await base.rastro.toArray();
    // t=0, t=60 000 (primera lectura ≥60 s: 60 000), t=120 000 -> 3 muestras × 2 pedidos
    expect(pts.filter((p) => p.orden_id === "A")).toHaveLength(3);
    expect(pts.filter((p) => p.orden_id === "B")).toHaveLength(3);
    expect(pts.every((p) => p.evento === "muestra" && p.repartidor_id === "R1")).toBe(true);
    expect(publicadas.length).toBeGreaterThan(pts.length / 2); // en vivo se publica mucho más seguido
  });

  it("llegada automática al entrar al radio del pin (una vez)", async () => {
    ctl.actualizarPedidos([pedido("A")]);
    prov.emitir(lectura(0, al_norte(400)));
    prov.emitir(lectura(15_000, al_norte(90)));
    prov.emitir(lectura(30_000, al_norte(70)));
    prov.emitir(lectura(45_000, al_norte(20)));
    await espera();
    expect(llegadas).toEqual(["A"]);
  });

  it("pedido sin pin o ya marcado como llegado: no hay llegada automática", async () => {
    ctl.actualizarPedidos([pedido("A", { destino_lat: null, destino_lng: null }), pedido("B", { llegado_at: "x" })]);
    prov.emitir(lectura(0, CASA));
    prov.emitir(lectura(15_000, CASA));
    await espera();
    expect(llegadas).toEqual([]);
  });

  it("permiso revocado, GPS apagado y vuelta de la señal", async () => {
    ctl.actualizarPedidos([pedido("A")]);
    prov.fallar("gps_apagado");
    expect(ctl.estadoActual).toBe("gps_apagado");
    prov.emitir(lectura(0, al_norte(500)));
    await espera();
    expect(ctl.estadoActual).toBe("activo");

    prov.fallar("permiso_denegado");
    expect(ctl.estadoActual).toBe("sin_permiso");
    expect(prov.activo()).toBe(false); // se deja de insistir
    expect(estados).toEqual(["activo", "gps_apagado", "activo", "sin_permiso"]);

    ctl.reintentar();
    expect(prov.activo()).toBe(true);
    expect(ctl.estadoActual).toBe("activo");
  });

  it("al volver al frente reanuda el GPS y manda la última posición enseguida", async () => {
    ctl.actualizarPedidos([pedido("A")]);
    prov.emitir(lectura(0, al_norte(500)));
    await espera();
    ctl.alIrASegundoPlano();
    prov.cb = null; // el sistema mató el watch en segundo plano
    publicadas.length = 0;

    ctl.alVolverAlFrente();
    expect(prov.activo()).toBe(true);
    expect(publicadas).toHaveLength(1);
    expect(publicadas[0].lectura.t).toBe(0);
    // y la siguiente lectura válida se publica sin esperar el intervalo
    prov.emitir(lectura(500, al_norte(502)));
    await espera();
    expect(publicadas).toHaveLength(2);
  });

  it("eventos: la salida se guarda con la primera lectura; la entrega con la última posición", async () => {
    ctl.actualizarPedidos([pedido("A")]);
    await ctl.registrarEvento("salida", "A"); // aún no hay lectura
    expect(await base.rastro.count()).toBe(0);
    prov.emitir(lectura(1_000, al_norte(300)));
    await espera();
    await ctl.registrarEvento("entrega", "A");
    const evs = (await base.rastro.toArray()).map((p) => p.evento).sort();
    expect(evs).toEqual(["entrega", "muestra", "salida"]);
  });

  it("sin posición no inventa un punto de entrega", async () => {
    ctl.actualizarPedidos([pedido("A")]);
    await ctl.registrarEvento("entrega", "A");
    expect(await base.rastro.count()).toBe(0);
  });

  it("detener() apaga todo aunque haya pedidos", () => {
    ctl.actualizarPedidos([pedido("A")]);
    ctl.detener();
    expect(prov.activo()).toBe(false);
    expect(ctl.rastreando).toBe(false);
  });
});

describe("enlaces del repartidor", () => {
  it("con pin: coordenadas; sin pin: busca la referencia", () => {
    expect(enlaceWaze({ lat: 14.07, lng: -87.19, referencia: "x" })).toBe("https://waze.com/ul?ll=14.07,-87.19&navigate=yes");
    expect(enlaceGoogleMaps({ lat: 14.07, lng: -87.19, referencia: "x" })).toBe("https://www.google.com/maps/dir/?api=1&destination=14.07%2C-87.19&travelmode=driving");
    const sin = { lat: null, lng: null, referencia: "Portón negro, frente a la pulpería", zona: "Col. Trejo" };
    expect(enlaceWaze(sin)).toContain("q=Port%C3%B3n%20negro");
    expect(enlaceWaze(sin)).toContain("Col.%20Trejo");
    expect(enlaceGoogleMaps(sin)).toContain("destination=Port%C3%B3n%20negro");
  });

  it("llamar y WhatsApp con código de Honduras", () => {
    expect(enlaceLlamar("9988-7766")).toBe("tel:+50499887766");
    expect(enlaceWhatsapp("99887766")).toBe("https://wa.me/50499887766");
    expect(enlaceWhatsapp("99887766", "Hola")).toBe("https://wa.me/50499887766?text=Hola");
  });
});

describe("JWT del repartidor", () => {
  const claims = { repartidorId: "r1", tenantId: "t1", sucursalId: "s1" };

  it("firma HS256 con rol authenticated y el claim repartidor_id, y dura un turno", () => {
    const { token, exp } = firmarJwtRepartidor(claims, "secreto", 1_000);
    expect(exp).toBe(1_000 + DURACION_TURNO_S);
    const v = verificarJwtRepartidor(token, "secreto", 1_001)!;
    expect(v).toMatchObject({ aud: "authenticated", role: "authenticated", sub: "r1", repartidor_id: "r1", tenant_id: "t1", sucursal_id: "s1" });
  });

  it("rechaza firma ajena, token alterado y token vencido", () => {
    const { token } = firmarJwtRepartidor(claims, "secreto", 1_000);
    expect(verificarJwtRepartidor(token, "otro-secreto", 1_001)).toBeNull();
    const [h, , f] = token.split(".");
    const falso = Buffer.from(JSON.stringify({ role: "service_role", exp: 9e9 })).toString("base64url");
    expect(verificarJwtRepartidor(`${h}.${falso}.${f}`, "secreto", 1_001)).toBeNull();
    expect(verificarJwtRepartidor(token, "secreto", 1_000 + DURACION_TURNO_S + 1)).toBeNull();
    expect(verificarJwtRepartidor("basura", "secreto")).toBeNull();
  });

  it("sin secreto no firma", () => {
    expect(() => firmarJwtRepartidor(claims, "")).toThrow(/SUPABASE_JWT_SECRET/);
  });
});
