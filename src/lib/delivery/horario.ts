export const DIAS_SEMANA = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"] as const;

/** Día de la semana en Honduras (UTC-6, sin horario de verano). */
export function diaHonduras(ahora = new Date()) {
  return DIAS_SEMANA[new Date(ahora.getTime() - 6 * 3600_000).getUTCDay()];
}

/** "10:00 a 14:00 y 18:00 a 22:00", o null si ese día está cerrado. */
export function textoHorario(horario: unknown, dia: string): string | null {
  const tramos = (horario as Record<string, { desde: string; hasta: string }[]> | null)?.[dia];
  if (!Array.isArray(tramos) || tramos.length === 0) return null;
  return tramos.map((t) => `${t.desde} a ${t.hasta}`).join(" y ");
}
