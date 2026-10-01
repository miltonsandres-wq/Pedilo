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

export type HorarioSemana = Record<string, { desde: string; hasta: string }[]>;

export const ETIQUETA_DIA: Record<(typeof DIAS_SEMANA)[number], string> = {
  dom: "Domingo", lun: "Lunes", mar: "Martes", mie: "Miércoles", jue: "Jueves", vie: "Viernes", sab: "Sábado",
};

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Arma el horario desde el formulario del admin (un tramo por día:
 * `abre_lun`, `desde_lun`, `hasta_lun`…). Devuelve el error en español si
 * alguna hora está mal. Un día sin marcar queda cerrado; "hasta" menor o igual
 * que "desde" significa que cruza la medianoche.
 */
export function horarioDesdeFormulario(valor: (campo: string) => string | null | undefined): { ok: true; horario: HorarioSemana } | { ok: false; error: string } {
  const horario: HorarioSemana = {};
  for (const dia of DIAS_SEMANA) {
    if (!valor(`abre_${dia}`)) continue;
    const desde = (valor(`desde_${dia}`) ?? "").trim();
    const hasta = (valor(`hasta_${dia}`) ?? "").trim();
    if (!HORA.test(desde) || !HORA.test(hasta)) {
      return { ok: false, error: `Revisa las horas del ${ETIQUETA_DIA[dia].toLowerCase()} (formato 24 h, ej. 10:00 a 22:00).` };
    }
    if (desde === hasta) return { ok: false, error: `El ${ETIQUETA_DIA[dia].toLowerCase()} abre y cierra a la misma hora.` };
    horario[dia] = [{ desde, hasta }];
  }
  return { ok: true, horario };
}
