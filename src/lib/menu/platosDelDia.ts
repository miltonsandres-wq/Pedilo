import { fechaLocalHN } from "@/lib/fiscal/formato";

/** Hoy en Honduras (YYYY-MM-DD): el «plato del día» se decide por esta fecha. */
export const hoyHN = (): string => fechaLocalHN(new Date());

/** Un producto es plato del día si su fecha marcada es la de hoy. Mañana deja de serlo solo. */
export function esPlatoDelDia(platoDiaFecha: string | null | undefined, hoy: string = hoyHN()): boolean {
  return !!platoDiaFecha && platoDiaFecha.slice(0, 10) === hoy;
}
