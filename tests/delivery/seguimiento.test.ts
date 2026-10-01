import { describe, it, expect } from "vitest";
import { distanciaM, dentroDeRadio, etaMinutos, textoDistancia, esPuntoValido } from "@/lib/location/geo";
import {
  construirLinea, puedeVerUbicacionRepartidor, calcularEta, posicionVigente, canalPedido, canalFlota,
  linkWhatsappTelefono, esFinal, type EstadoDelivery,
} from "@/lib/delivery/seguimiento";
import { instruccionesAPdf } from "@/lib/printing/ticketPdf";
import { construirFactura, type DocumentoImprimible } from "@/lib/printing/documentoTexto";

const TEGUS = { lat: 14.0723, lng: -87.1921 };

describe("geo", () => {
  it("distancia haversine: 0, ~111 km por grado de latitud, simétrica", () => {
    expect(distanciaM(TEGUS, TEGUS)).toBe(0);
    const km = distanciaM({ lat: 14, lng: -87 }, { lat: 15, lng: -87 }) / 1000;
    expect(km).toBeGreaterThan(110.5);
    expect(km).toBeLessThan(111.9);
    const a = { lat: 14.07, lng: -87.19 }, b = { lat: 14.09, lng: -87.17 };
    expect(distanciaM(a, b)).toBeCloseTo(distanciaM(b, a), 6);
  });

  it("geocerca: dentro/fuera de un radio", () => {
    const cerca = { lat: TEGUS.lat + 0.0005, lng: TEGUS.lng }; // ~55 m
    const lejos = { lat: TEGUS.lat + 0.002, lng: TEGUS.lng }; // ~222 m
    expect(dentroDeRadio(cerca, TEGUS, 100)).toBe(true);
    expect(dentroDeRadio(lejos, TEGUS, 100)).toBe(false);
  });

  it("ETA = distancia / 25 km/h por omisión, mínimo 1 min, velocidad configurable", () => {
    expect(etaMinutos(25_000 / 60)).toBe(1); // 416 m a 25 km/h = 1 min
    expect(etaMinutos(5_000)).toBe(12); // 5 km a 25 km/h = 12 min
    expect(etaMinutos(0)).toBe(1);
    expect(etaMinutos(5_000, 50)).toBe(6);
    expect(etaMinutos(5_000, 0)).toBe(12); // velocidad inválida cae al default
  });

  it("formato de distancia y validación de puntos", () => {
    expect(textoDistancia(480)).toBe("480 m");
    expect(textoDistancia(1530)).toBe("1.5 km");
    expect(esPuntoValido({ lat: 14, lng: -87 })).toBe(true);
    expect(esPuntoValido({ lat: NaN, lng: -87 })).toBe(false);
    expect(esPuntoValido({ lat: 91, lng: 0 })).toBe(false);
    expect(esPuntoValido(null)).toBe(false);
  });
});

describe("privacidad del seguimiento", () => {
  const estados: EstadoDelivery[] = ["recibido", "aceptado", "en_cocina", "listo", "en_camino", "entregado", "rechazado", "cancelado"];

  it("la ubicación del repartidor solo se ve mientras el pedido va en camino", () => {
    for (const e of estados) expect(puedeVerUbicacionRepartidor(e), e).toBe(e === "en_camino");
  });

  it("el canal público del pedido lleva el token; el de flota es aparte", () => {
    expect(canalPedido("abc")).toBe("pedido:abc");
    expect(canalFlota("s1")).toBe("flota:s1");
  });

  it("una posición vieja deja de ser 'en vivo'", () => {
    const t = 1_000_000;
    expect(posicionVigente({ ...TEGUS, t }, t + 60_000)).toBe(true);
    expect(posicionVigente({ ...TEGUS, t }, t + 4 * 60_000)).toBe(false);
    expect(posicionVigente(null, t)).toBe(false);
  });

  it("ETA solo con posición y destino válidos", () => {
    expect(calcularEta(null, TEGUS, 25)).toBeNull();
    expect(calcularEta(TEGUS, null, 25)).toBeNull();
    const eta = calcularEta({ lat: TEGUS.lat + 0.02, lng: TEGUS.lng }, TEGUS, 25)!;
    expect(eta.distanciaM).toBeGreaterThan(2000);
    expect(eta.minutos).toBeGreaterThanOrEqual(5);
  });

  it("estados finales", () => {
    expect(estados.filter(esFinal)).toEqual(["entregado", "rechazado", "cancelado"]);
  });
});

describe("línea de tiempo", () => {
  const base = { recibido_at: "a", aceptado_at: null, en_cocina_at: null, listo_at: null, en_camino_at: null, entregado_at: null };

  it("marca hechos, el actual y pendientes", () => {
    const l = construirLinea({ ...base, estado: "en_cocina" });
    expect(l.map((p) => p.situacion)).toEqual(["hecho", "hecho", "actual", "pendiente", "pendiente", "pendiente"]);
  });

  it("entregado deja todo hecho; rechazado y cancelado no tienen línea", () => {
    expect(construirLinea({ ...base, estado: "entregado" }).every((p) => p.situacion === "hecho")).toBe(true);
    expect(construirLinea({ ...base, estado: "rechazado" })).toEqual([]);
    expect(construirLinea({ ...base, estado: "cancelado" })).toEqual([]);
  });
});

describe("contacto", () => {
  it("WhatsApp con código de país para números de 8 dígitos", () => {
    expect(linkWhatsappTelefono("9876-5432")).toBe("https://wa.me/50498765432");
    expect(linkWhatsappTelefono("98765432", "Hola")).toBe("https://wa.me/50498765432?text=Hola");
  });
});

describe("factura en PDF (80 mm)", () => {
  const doc: DocumentoImprimible = {
    clase: "factura", estado: "emitida", numero_completo: "001-001-01-00000042", cai: "A1B2C3-D4E5F6-A1B2C3-D4E5F6-A1B2C3-D4",
    rango_desde: 1, rango_hasta: 500, establecimiento: "001", punto_emision: "001", tipo_doc: "01",
    fecha_limite: "2030-12-31", fecha_emision: "2030-06-15T18:00:00Z",
    emisor_snapshot: { razon_social: "Fondita Doña Ana S.A.", nombre_comercial: "Fondita", rtn: "08011999123456", direccion_fiscal: "Col. Palmira, Tegucigalpa", telefono: null, correo: null },
    cliente_nombre: "Ana López", cliente_rtn: null, no_orden_compra_exenta: null, no_constancia_exonerado: null, no_registro_sag: null,
    importe_exonerado: 0, importe_exento: 0, gravado_15: 113.04, gravado_18: 0, isv_15: 16.96, isv_18: 0, cargo_servicio: 0,
    total: 130, total_letras: "CIENTO TREINTA LEMPIRAS EXACTOS",
    lineas: [{ nombre: "Tacos", cantidad: 2, precio_unitario: 50, total: 100 }, { nombre: "Envío", cantidad: 1, precio_unitario: 30, total: 30 }],
  };

  it("genera un PDF válido de ancho 80 mm con acentos y símbolos raros", async () => {
    const bytes = await instruccionesAPdf(construirFactura({ ...doc, cliente_nombre: "José Peña ≥ ñandú" }));
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1500);
  });
});
