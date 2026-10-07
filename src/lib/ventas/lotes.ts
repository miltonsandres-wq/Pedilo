/** `.in()` con cientos de ids revienta la URL de la consulta: se hace de a lotes. */
export function enLotes<T>(items: T[], tamano = 80): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) lotes.push(items.slice(i, i + tamano));
  return lotes;
}
