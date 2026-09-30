/**
 * Cálculo de ISV para facturas fiscales. Los precios del menú INCLUYEN ISV
 * (práctica común en restaurantes de Honduras), así que la base se obtiene
 * dividiendo el total del grupo entre (1 + tasa), y el ISV es el resto:
 * base + ISV cuadra EXACTO con lo cobrado.
 *
 * Toda la aritmética se hace en centavos enteros para evitar errores de
 * punto flotante.
 */

export type TasaIsv = "exento" | "15" | "18";

export interface LineaFiscal {
  nombre: string;
  cantidad: number;
  precioUnitario: number; // con ISV incluido
  tasa: TasaIsv;
}

export interface LineaCalculada extends LineaFiscal {
  /** cantidad × precio, ya con el descuento prorrateado */
  totalLinea: number;
}

export interface OpcionesImpuestos {
  /** El cliente presentó constancia de exonerado: todo va a importe exonerado, ISV 0. */
  exonerado?: boolean;
  /** Descuento total de la orden; se prorratea entre las líneas ANTES de calcular la base. */
  descuento?: number;
  /** Propina / cargo por servicio: línea aparte, FUERA de la base gravable. */
  cargoServicio?: number;
}

export interface ResultadoImpuestos {
  importeExonerado: number;
  importeExento: number;
  gravado15: number;
  gravado18: number;
  isv15: number;
  isv18: number;
  cargoServicio: number;
  total: number;
  lineas: LineaCalculada[];
}

const aCentavos = (monto: number) => Math.round(monto * 100);
const aMonto = (centavos: number) => centavos / 100;

/** Redondeo half-up con enteros: round(num / den) sin errores de float. */
function divRedondeada(num: number, den: number): number {
  return Math.floor((2 * num + den) / (2 * den));
}

/** Separa un total con ISV incluido en base + ISV (en centavos). */
function separarBaseIsv(totalCentavos: number, tasaPorcentaje: number) {
  const base = divRedondeada(totalCentavos * 100, 100 + tasaPorcentaje);
  return { base, isv: totalCentavos - base };
}

/**
 * Prorratea `descuento` (centavos) entre montos proporcionalmente, por el
 * método del resto mayor: la suma de las partes es EXACTAMENTE el descuento.
 */
function prorratear(montos: number[], descuento: number): number[] {
  const subtotal = montos.reduce((a, b) => a + b, 0);
  if (descuento === 0 || subtotal === 0) return montos.map(() => 0);

  const partes = montos.map((m) => Math.floor((descuento * m) / subtotal));
  let resto = descuento - partes.reduce((a, b) => a + b, 0);

  const ordenPorResto = montos
    .map((m, i) => ({ i, resto: (descuento * m) % subtotal }))
    .sort((a, b) => b.resto - a.resto || montos[b.i] - montos[a.i] || a.i - b.i);

  for (const { i } of ordenPorResto) {
    if (resto === 0) break;
    partes[i] += 1;
    resto -= 1;
  }
  return partes;
}

export function calcularImpuestos(
  lineas: LineaFiscal[],
  opciones: OpcionesImpuestos = {}
): ResultadoImpuestos {
  const descuento = aCentavos(opciones.descuento ?? 0);
  const cargo = aCentavos(opciones.cargoServicio ?? 0);

  if (lineas.length === 0) throw new Error("La factura necesita al menos una línea");
  if (descuento < 0 || cargo < 0) throw new Error("Descuento y cargo por servicio no pueden ser negativos");

  const brutos = lineas.map((l) => {
    if (!["exento", "15", "18"].includes(l.tasa)) throw new Error(`Tasa de ISV inválida: ${l.tasa}`);
    if (!Number.isInteger(l.cantidad) || l.cantidad < 1) throw new Error("La cantidad debe ser un entero positivo");
    if (l.precioUnitario < 0) throw new Error("El precio no puede ser negativo");
    return aCentavos(l.precioUnitario) * l.cantidad;
  });

  const subtotal = brutos.reduce((a, b) => a + b, 0);
  if (descuento > subtotal) throw new Error("El descuento no puede ser mayor que el total");

  const descuentos = prorratear(brutos, descuento);
  const netos = brutos.map((b, i) => b - descuentos[i]);

  const totalPorTasa = { exento: 0, "15": 0, "18": 0 } as Record<TasaIsv, number>;
  lineas.forEach((l, i) => {
    totalPorTasa[l.tasa] += netos[i];
  });

  let importeExonerado = 0;
  let importeExento = 0;
  let gravado15 = 0;
  let gravado18 = 0;
  let isv15 = 0;
  let isv18 = 0;

  if (opciones.exonerado) {
    importeExonerado = totalPorTasa.exento + totalPorTasa["15"] + totalPorTasa["18"];
  } else {
    importeExento = totalPorTasa.exento;
    ({ base: gravado15, isv: isv15 } = separarBaseIsv(totalPorTasa["15"], 15));
    ({ base: gravado18, isv: isv18 } = separarBaseIsv(totalPorTasa["18"], 18));
  }

  const total = importeExonerado + importeExento + gravado15 + gravado18 + isv15 + isv18 + cargo;

  return {
    importeExonerado: aMonto(importeExonerado),
    importeExento: aMonto(importeExento),
    gravado15: aMonto(gravado15),
    gravado18: aMonto(gravado18),
    isv15: aMonto(isv15),
    isv18: aMonto(isv18),
    cargoServicio: aMonto(cargo),
    total: aMonto(total),
    lineas: lineas.map((l, i) => ({ ...l, totalLinea: aMonto(netos[i]) })),
  };
}
