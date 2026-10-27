/** Cuánto espera una comanda en cocina y qué tan urgente es. Funciones puras (se prueban sin pantalla). */

export type NivelUrgencia = "fresco" | "atencion" | "critico";

/** Minutos para pasar a «atención» (ámbar) y a «crítico» (rojo). */
export const MINUTOS_ATENCION = 5;
export const MINUTOS_CRITICO = 10;

/** Minutos enteros desde que se envió a cocina (0 si no hay fecha o es futura). */
export function minutosDesde(enviadaAt: string | null | undefined, ahoraMs: number): number {
  if (!enviadaAt) return 0;
  return Math.max(0, Math.floor((ahoraMs - new Date(enviadaAt).getTime()) / 60_000));
}

export function nivelUrgencia(minutos: number): NivelUrgencia {
  if (minutos >= MINUTOS_CRITICO) return "critico";
  if (minutos >= MINUTOS_ATENCION) return "atencion";
  return "fresco";
}

export const ETIQUETA_URGENCIA: Record<NivelUrgencia, string> = {
  fresco: "En tiempo",
  atencion: "Atender",
  critico: "¡Urgente!",
};
