import { describe, it, expect } from "vitest";
import { clasificarDiferencia, diferenciaLiquidacion, leerMonto, textoDiferencia } from "@/lib/delivery/liquidacion";
import { construirReporteDelivery, rangoFechasHN, resumirLiquidaciones, type FilaReporte } from "@/lib/delivery/reportes";

describe("liquidación: diferencia", () => {
  it("se calcula en centavos exactos: entregado − cobrado (negativo = faltante)", () => {
    expect(diferenciaLiquidacion(380, 390)).toBe(-10);
    expect(diferenciaLiquidacion(390, 390)).toBe(0);
    expect(diferenciaLiquidacion(400.5, 390)).toBe(10.5);
    expect(diferenciaLiquidacion(0.3, 0.1 + 0.2)).toBe(0); // sin errores de coma flotante
  });

  it("clasifica y describe", () => {
    expect(clasificarDiferencia(0)).toBe("cuadrado");
    expect(clasificarDiferencia(-0.001)).toBe("cuadrado");
    expect(clasificarDiferencia(-10)).toBe("faltante");
    expect(clasificarDiferencia(5)).toBe("sobrante");
    expect(textoDiferencia(-10)).toBe("Faltante L 10.00");
    expect(textoDiferencia(2.5)).toBe("Sobrante L 2.50");
    expect(textoDiferencia(0)).toBe("Cuadrado");
  });

  it("lee montos escritos de varias formas y rechaza lo inválido", () => {
    expect(leerMonto("1250.50")).toBe(1250.5);
    expect(leerMonto("1,250.50")).toBe(1250.5);
    expect(leerMonto("1250,5")).toBe(1250.5);
    expect(leerMonto(" 390 ")).toBe(390);
    expect(leerMonto("")).toBeNull();
    expect(leerMonto("abc")).toBeNull();
    expect(leerMonto("-5")).toBeNull();
  });
});

describe("cierre diario: resumen de liquidaciones", () => {
  it("suma lo entregado en caja, el sistema, la diferencia y el pago de envíos", () => {
    const r = resumirLiquidaciones(7, [
      { total_efectivo_cobrado: 390, total_entregado_en_caja: 380, diferencia: -10, total_pago_envios: 75 },
      { total_efectivo_cobrado: 260.1, total_entregado_en_caja: 260.1, diferencia: 0, total_pago_envios: 0 },
    ]);
    expect(r).toEqual({ pedidosEntregados: 7, liquidaciones: 2, efectivoEntregadoEnCaja: 640.1, efectivoCobradoSegunSistema: 650.1, diferencia: -10, pagoEnvios: 75 });
  });

  it("sin liquidaciones todo en cero", () => {
    expect(resumirLiquidaciones(0, [])).toMatchObject({ liquidaciones: 0, efectivoEntregadoEnCaja: 0, diferencia: 0 });
  });
});

describe("reporte de delivery", () => {
  const f = (o: Partial<FilaReporte>): FilaReporte => ({
    repartidor_id: "R1", estado_delivery: "entregado", metodo_pago: "efectivo", tarifa_envio: 30, monto_cobrado: 130,
    recibido_at: "2026-06-01T18:00:00Z", aceptado_at: "2026-06-01T18:02:00Z", listo_at: "2026-06-01T18:22:00Z",
    en_camino_at: "2026-06-01T18:25:00Z", entregado_at: "2026-06-01T18:45:00Z", motivo_cancelacion: null, ...o,
  });
  const nombres = new Map([["R1", "Luis"], ["R2", "Pedro"]]);

  it("pedidos y cobros por repartidor, ordenados por entregas", () => {
    const r = construirReporteDelivery([
      f({}), f({ en_camino_at: "2026-06-01T19:00:00Z", entregado_at: "2026-06-01T19:30:00Z" }),
      f({ repartidor_id: "R2", metodo_pago: "transferencia", monto_cobrado: 200, tarifa_envio: 0 }),
    ], nombres);
    expect(r.porRepartidor.map((x) => [x.nombre, x.entregados])).toEqual([["Luis", 2], ["Pedro", 1]]);
    const luis = r.porRepartidor[0];
    expect(luis).toMatchObject({ minutosEntregaPromedio: 25, efectivoCobrado: 260, totalCobrado: 260 });
    expect(r.porRepartidor[1]).toMatchObject({ efectivoCobrado: 0, totalCobrado: 200 }); // transferencia no es efectivo
    expect(r.ventasEnvio).toBe(60);
  });

  it("tiempos promedio de cada tramo", () => {
    const r = construirReporteDelivery([f({}), f({ aceptado_at: "2026-06-01T18:04:00Z", listo_at: "2026-06-01T18:34:00Z" })], nombres);
    expect(r.tiempos.recibidoAAceptadoMin).toBe(3); // (2 + 4) / 2
    expect(r.tiempos.aceptadoAListoMin).toBe(25); // (20 + 30) / 2
    expect(r.tiempos.enCaminoAEntregadoMin).toBe(20);
  });

  it("cancelaciones, rechazos, motivos y tasa; lo que sigue en curso no cuenta como terminado", () => {
    const r = construirReporteDelivery([
      f({}), f({}),
      f({ estado_delivery: "cancelado", motivo_cancelacion: "Cliente no contesta", entregado_at: null, en_camino_at: null }),
      f({ estado_delivery: "rechazado", motivo_cancelacion: "Cliente no contesta", entregado_at: null, en_camino_at: null }),
      f({ estado_delivery: "rechazado", motivo_cancelacion: null, entregado_at: null, en_camino_at: null }),
      f({ estado_delivery: "en_camino", entregado_at: null }),
    ], nombres);
    expect(r).toMatchObject({ totalPedidos: 6, entregados: 2, cancelados: 1, rechazados: 2, enCurso: 1, tasaCancelacion: 60 });
    expect(r.motivosCancelacion).toEqual([{ motivo: "Cliente no contesta", cantidad: 2 }, { motivo: "Sin motivo", cantidad: 1 }]);
  });

  it("rango vacío: ceros y promedios nulos, sin divisiones por cero", () => {
    const r = construirReporteDelivery([], nombres);
    expect(r).toMatchObject({ totalPedidos: 0, tasaCancelacion: 0, porRepartidor: [], tiempos: { recibidoAAceptadoMin: null, aceptadoAListoMin: null, enCaminoAEntregadoMin: null } });
  });

  it("el rango de fechas va de las 00:00 a las 23:59:59 de Honduras", () => {
    expect(rangoFechasHN("2026-06-01", "2026-06-02")).toEqual({ desde: "2026-06-01T06:00:00.000Z", hasta: "2026-06-03T05:59:59.999Z" });
  });
});
