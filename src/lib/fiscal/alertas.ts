import { diasEntre } from "./formato";

/** Umbrales de alerta pedidos por el SAR/negocio: 85 % consumido o 30 días para vencer. */
export const UMBRAL_CONSUMO = 0.85;
export const UMBRAL_DIAS = 30;

export interface RangoParaResumen {
  desde: number;
  hasta: number;
  siguiente: number;
  fecha_limite: string;
  estado: string;
}

export type NivelAlerta = "ok" | "consumo" | "vencimiento" | "agotado" | "vencido";

export interface ResumenRango {
  total: number;
  usados: number;
  restantes: number;
  pctConsumido: number; // 0..1
  diasParaVencer: number; // negativo = ya venció
  nivel: NivelAlerta;
}

/** hoyHN: fecha local de Honduras (YYYY-MM-DD), ver fechaLocalHN(). */
export function resumirRango(r: RangoParaResumen, hoyHN: string): ResumenRango {
  const total = r.hasta - r.desde + 1;
  const usados = Math.min(total, Math.max(0, r.siguiente - r.desde));
  const restantes = total - usados;
  const pctConsumido = total === 0 ? 1 : usados / total;
  const diasParaVencer = diasEntre(hoyHN, r.fecha_limite.slice(0, 10));

  let nivel: NivelAlerta = "ok";
  if (r.estado === "agotado" || restantes === 0) nivel = "agotado";
  else if (r.estado === "vencido" || diasParaVencer < 0) nivel = "vencido";
  else if (pctConsumido >= UMBRAL_CONSUMO) nivel = "consumo";
  else if (diasParaVencer <= UMBRAL_DIAS) nivel = "vencimiento";

  return { total, usados, restantes, pctConsumido, diasParaVencer, nivel };
}

export const MENSAJES_ALERTA: Record<Exclude<NivelAlerta, "ok">, string> = {
  consumo: "Se consumió más del 85 % del rango de facturas: tramita el siguiente CAI.",
  vencimiento: "Faltan 30 días o menos para la fecha límite de emisión del CAI.",
  agotado: "El rango de facturas se agotó: no se puede facturar hasta cargar un nuevo CAI.",
  vencido: "El CAI venció: no se puede facturar hasta cargar uno vigente.",
};
