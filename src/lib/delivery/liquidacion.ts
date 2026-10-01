import { formatearLempiras } from "./validaciones";

/**
 * Liquidación del repartidor (lado cliente). El CÁLCULO oficial lo hace el
 * servidor (RPC calcular_liquidacion / cerrar_liquidacion); esto solo ayuda a
 * mostrar la diferencia mientras el cajero escribe cuánto le entregaron.
 */

export interface CalculoLiquidacion {
  repartidor_id: string;
  turno_inicio: string | null;
  pedidos: {
    orden_id: string;
    numero: number | null;
    cliente: string;
    metodo_pago: string;
    monto_cobrado: number | null;
    tarifa_envio: number;
    entregado_at: string;
  }[];
  total_pedidos: number;
  total_efectivo_cobrado: number;
  total_pago_envios: number;
  pendientes_en_camino: number;
}

export type TipoDiferencia = "cuadrado" | "sobrante" | "faltante";

/** entregado − cobrado, en centavos exactos (negativo = faltante). */
export function diferenciaLiquidacion(entregado: number, cobradoSegunSistema: number): number {
  return Math.round((entregado - cobradoSegunSistema) * 100) / 100 || 0; // `|| 0` evita el -0
}

export function clasificarDiferencia(diferencia: number): TipoDiferencia {
  if (Math.abs(diferencia) < 0.005) return "cuadrado";
  return diferencia > 0 ? "sobrante" : "faltante";
}

export function textoDiferencia(diferencia: number): string {
  const tipo = clasificarDiferencia(diferencia);
  if (tipo === "cuadrado") return "Cuadrado";
  return `${tipo === "sobrante" ? "Sobrante" : "Faltante"} ${formatearLempiras(Math.abs(diferencia))}`;
}

/** Texto del input de dinero ("1,250.50" / "1250,5") a número; null si no es un monto válido. */
export function leerMonto(texto: string): number | null {
  const limpio = texto.trim().replace(/\s/g, "");
  if (!limpio) return null;
  const normal = /,\d{1,2}$/.test(limpio) && !/\./.test(limpio) ? limpio.replace(",", ".") : limpio.replace(/,/g, "");
  const n = Number(normal);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
