import { etiquetaHora, type VentaPorHora } from "@/lib/reportes/graficas";

/**
 * Gráficas del reporte, dibujadas con HTML/SVG propio (sin librerías). Son componentes de servidor:
 * no llevan estado. El panel del admin es de tema claro, así que usan la serie 1 de la paleta
 * validada (azul `#2a78d6`, 3.9:1 sobre blanco) y los tonos de texto del proyecto para rótulos
 * (el texto nunca lleva el color de la serie). Una sola serie por gráfica: la identidad la da el
 * rótulo de cada barra, no el color.
 */

const SERIE = "#2a78d6";
const REJILLA = "#e2e8f0"; // ink-200: recesiva
const TEXTO_EJE = "#64748b"; // ink-500

const lempiras = (n: number) => `L. ${n.toFixed(2)}`;

export interface FilaBarra {
  nombre: string;
  valor: number;
  /** Texto corto a la derecha del valor (ej. «42 %» o «×12»). */
  detalle?: string;
}

/**
 * Barras horizontales ordenadas (la fila más larga arriba). Cada fila lleva su nombre y su valor
 * como texto, así que la lista es también la tabla de datos.
 */
export function BarrasHorizontales({
  titulo,
  filas,
  formato = lempiras,
  vacio = "Sin datos ese día.",
}: {
  titulo: string;
  filas: FilaBarra[];
  formato?: (n: number) => string;
  vacio?: string;
}) {
  const max = Math.max(0, ...filas.map((f) => f.valor));
  return (
    <div role="group" aria-label={titulo}>
      {filas.length === 0 && <p className="text-sm text-ink-400">{vacio}</p>}
      <ul className="space-y-2.5">
        {filas.map((f) => {
          const pct = max > 0 ? Math.max(f.valor > 0 ? 2 : 0, (f.valor / max) * 100) : 0;
          return (
            <li key={f.nombre} title={`${f.nombre}: ${formato(f.valor)}${f.detalle ? ` (${f.detalle})` : ""}`}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate capitalize text-ink-700">{f.nombre}</span>
                <span className="shrink-0 tabular-nums font-medium text-ink-900">
                  {formato(f.valor)}
                  {f.detalle && <span className="ml-1.5 text-xs font-normal text-ink-500">{f.detalle}</span>}
                </span>
              </div>
              {/* Pista recesiva + barra fina anclada a la izquierda, con el extremo de datos redondeado */}
              <div className="h-2.5 w-full rounded-r bg-ink-100" aria-hidden="true">
                <div className="h-full" style={{ width: `${pct}%`, background: SERIE, borderRadius: "0 4px 4px 0" }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Columnas por hora del día (hora de Honduras). Eje continuo: las horas sin ventas aparecen en cero.
 * La hora pico lleva su valor rotulado; el resto se lee con el tooltip del navegador y con la tabla.
 */
export function ColumnasPorHora({ datos, titulo = "Ventas por hora" }: { datos: VentaPorHora[]; titulo?: string }) {
  if (datos.length === 0) return <p className="text-sm text-ink-400">Sin cobros ese día.</p>;

  const max = Math.max(...datos.map((d) => d.total));
  const ancho = 36;
  const alto = 150;
  const izq = 44; // espacio para los rótulos del eje Y
  const arriba = 18; // espacio para el rótulo de la hora pico
  const abajo = 20; // espacio para las horas
  const w = izq + datos.length * ancho + 8;
  const h = arriba + alto + abajo;
  const base = arriba + alto;
  const escala = (v: number) => (max > 0 ? (v / max) * alto : 0);
  const pico = datos.reduce((a, b) => (b.total > a.total ? b : a));
  // Con muchas horas se rotula una sí y una no para que no se amontonen
  const paso = datos.length > 12 ? 2 : 1;
  const marcas = [0, max / 2, max];

  return (
    <div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          style={{ minWidth: Math.min(w, 320), width: "100%", height: "auto" }}
          role="img"
          aria-label={`${titulo}. Hora con más ventas: ${etiquetaHora(pico.hora)}, ${lempiras(pico.total)}.`}
        >
          {marcas.map((m, i) => {
            const y = base - escala(m);
            return (
              <g key={i}>
                <line x1={izq} x2={w - 4} y1={y} y2={y} stroke={REJILLA} strokeWidth={1} />
                <text x={izq - 6} y={y + 3} textAnchor="end" fontSize={10} fill={TEXTO_EJE}>
                  {Math.round(m).toLocaleString("en-US")}
                </text>
              </g>
            );
          })}
          {datos.map((d, i) => {
            const x = izq + i * ancho + 6;
            const bw = ancho - 12;
            const bh = escala(d.total);
            const y = base - bh;
            const r = Math.min(4, bw / 2, bh);
            return (
              <g key={d.hora}>
                <title>{`${etiquetaHora(d.hora)} — ${lempiras(d.total)}`}</title>
                {/* Zona de toque más ancha que la barra */}
                <rect x={izq + i * ancho} y={arriba} width={ancho} height={alto} fill="transparent" />
                {bh > 0 && (
                  <path
                    d={`M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${base} Z`}
                    fill={SERIE}
                  />
                )}
                {d.hora === pico.hora && d.total > 0 && (
                  <text x={x + bw / 2} y={y - 5} textAnchor="middle" fontSize={11} fontWeight={600} fill="#0f172a">
                    {Math.round(d.total).toLocaleString("en-US")}
                  </text>
                )}
                {i % paso === 0 && (
                  <text x={x + bw / 2} y={base + 14} textAnchor="middle" fontSize={10} fill={TEXTO_EJE}>
                    {String(d.hora).padStart(2, "0")}h
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <details className="mt-2 text-xs text-ink-500">
        <summary className="cursor-pointer select-none">Ver como tabla</summary>
        <table className="mt-1.5 w-full max-w-xs text-left tabular-nums">
          <thead>
            <tr className="text-ink-400">
              <th className="py-0.5 font-medium">Hora</th>
              <th className="py-0.5 text-right font-medium">Cobrado</th>
            </tr>
          </thead>
          <tbody>
            {datos.map((d) => (
              <tr key={d.hora}>
                <td className="py-0.5">{etiquetaHora(d.hora)}</td>
                <td className="py-0.5 text-right">{lempiras(d.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
