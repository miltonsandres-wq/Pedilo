/**
 * Plano del local en el POS: qué mesas se dibujan posicionadas y cómo se
 * separan por zona. Funciones puras: el admin guarda pos_x / pos_y (en % del
 * lienzo) y aquí se decide si hay un plano utilizable o se cae a la cuadrícula.
 */

export interface MesaPlano {
  id: string;
  zona: string | null;
  pos_x: number | null;
  pos_y: number | null;
}

/** Nombre de la zona de las mesas que no tienen una asignada. */
export const ZONA_SIN_NOMBRE = "Salón";

export const nombreZona = (zona: string | null | undefined): string => zona?.trim() || ZONA_SIN_NOMBRE;

/** Zonas presentes (sin repetir), en orden alfabético con «Salón» primero. */
export function zonasDeMesas(mesas: Pick<MesaPlano, "zona">[]): string[] {
  const zonas = Array.from(new Set(mesas.map((m) => nombreZona(m.zona))));
  return zonas.sort((a, b) => (a === ZONA_SIN_NOMBRE ? -1 : b === ZONA_SIN_NOMBRE ? 1 : a.localeCompare(b, "es")));
}

export const mesasDeZona = <T extends Pick<MesaPlano, "zona">>(mesas: T[], zona: string): T[] =>
  mesas.filter((m) => nombreZona(m.zona) === zona);

/** La mesa ya tiene lugar en el plano (el admin la ubicó o quedó con la posición por omisión). */
export function posicionDe(m: Pick<MesaPlano, "pos_x" | "pos_y">): { x: number; y: number } | null {
  if (m.pos_x == null || m.pos_y == null) return null;
  const x = Number(m.pos_x);
  const y = Number(m.pos_y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/**
 * ¿Se puede dibujar un plano con estas mesas? Hace falta que al menos dos
 * estén en puntos distintos: las mesas recién creadas nacen todas en el mismo
 * punto y amontonadas no sirven; en ese caso se usa la cuadrícula de siempre.
 */
export function tienePlano(mesas: Pick<MesaPlano, "pos_x" | "pos_y">[]): boolean {
  const puntos = new Set<string>();
  for (const m of mesas) {
    const p = posicionDe(m);
    if (p) puntos.add(`${Math.round(p.x)}|${Math.round(p.y)}`);
  }
  return puntos.size >= 2;
}

/** Posición inicial de la mesa n-ésima (0, 1, 2…) para que las nuevas no queden apiladas: cuadrícula en % del lienzo. */
export function posicionInicial(indice: number): { x: number; y: number } {
  const columnas = 4;
  const col = indice % columnas;
  const fila = Math.floor(indice / columnas) % 4;
  return { x: 14 + col * 24, y: 16 + fila * 22 };
}
