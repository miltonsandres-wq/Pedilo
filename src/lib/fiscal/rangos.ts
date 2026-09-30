import { dentroDeFechaLimite, formatearFecha } from "./formato";

export type ClaseDocumento = "factura" | "nota_credito" | "nota_debito";

export type CodigoFiscal =
  | "sin_dispositivo"
  | "sin_emisor"
  | "sin_rango"
  | "rango_agotado"
  | "rango_vencido"
  | "cliente_invalido"
  | "sin_lineas"
  | "documento_no_encontrado"
  | "ya_acreditado";

/** Error de facturación con código estable para que la UI decida qué mostrar. */
export class FiscalError extends Error {
  constructor(
    public codigo: CodigoFiscal,
    mensaje: string
  ) {
    super(mensaje);
    this.name = "FiscalError";
  }
}

/** Lo mínimo de un rango que necesita la planificación (RangoCaiLocal lo cumple). */
export interface RangoPlanificable {
  id: string;
  clase: string;
  tipo_doc: string;
  desde: number;
  hasta: number;
  siguiente: number;
  fecha_limite: string;
  estado: string;
}

export interface CambioRango {
  estado?: string;
  siguiente?: number;
}

export interface PlanEmision<R extends RangoPlanificable> {
  rango: R;
  correlativo: number;
  /** Cambios a aplicar a los rangos locales, por id (incluye avanzar `siguiente`). */
  cambios: Record<string, CambioRango>;
}

const agotado = (r: RangoPlanificable) => r.siguiente > r.hasta || r.estado === "agotado";
const vigente = (r: RangoPlanificable, ahora: Date) => dentroDeFechaLimite(ahora, r.fecha_limite);
const utilizable = (r: RangoPlanificable, ahora: Date) =>
  (r.estado === "activo" || r.estado === "pendiente") && !agotado(r) && vigente(r, ahora);

/**
 * Decide de qué rango sale el próximo número y qué cambia localmente:
 *  - usa el rango ACTIVO utilizable; si no hay, activa el PENDIENTE utilizable
 *    de menor `desde` (auto-activación cuando el activo se agotó o venció);
 *  - avanza `siguiente`; si con eso se agota, lo marca agotado y activa el
 *    siguiente pendiente de una vez.
 * Si no hay ninguno utilizable LANZA FiscalError: no existe modo permisivo.
 * Es una función pura: no toca la base; quien la llama aplica `cambios`.
 */
export function planificarEmision<R extends RangoPlanificable>(
  rangos: R[],
  clase: ClaseDocumento,
  ahora: Date
): PlanEmision<R> {
  const candidatos = rangos.filter((r) => r.clase === clase);
  const etiqueta =
    clase === "factura" ? "facturas" : clase === "nota_credito" ? "notas de crédito" : "notas de débito";

  if (candidatos.length === 0) {
    throw new FiscalError(
      "sin_rango",
      `No hay un CAI cargado para ${etiqueta} en este punto de emisión. Pídele al administrador que cargue el rango autorizado por el SAR.`
    );
  }

  const porDesde = (a: R, b: R) => a.desde - b.desde;
  const elegido =
    candidatos.filter((r) => r.estado === "activo" && utilizable(r, ahora)).sort(porDesde)[0] ??
    candidatos.filter((r) => r.estado === "pendiente" && utilizable(r, ahora)).sort(porDesde)[0];

  if (!elegido) {
    const ultimo = [...candidatos].sort((a, b) => b.hasta - a.hasta)[0];
    if (agotado(ultimo)) {
      throw new FiscalError(
        "rango_agotado",
        `El rango de ${etiqueta} autorizado se agotó. Carga un nuevo CAI para poder cobrar.`
      );
    }
    throw new FiscalError(
      "rango_vencido",
      `El CAI venció el ${formatearFecha(ultimo.fecha_limite)}. Carga un CAI vigente para poder cobrar.`
    );
  }

  const cambios: Record<string, CambioRango> = {};
  const marcar = (id: string, cambio: CambioRango) => {
    cambios[id] = { ...cambios[id], ...cambio };
  };

  // Otros activos del mismo tipo que ya no sirven (agotados/vencidos) se cierran
  for (const r of candidatos) {
    if (r.id !== elegido.id && r.tipo_doc === elegido.tipo_doc && r.estado === "activo" && !utilizable(r, ahora)) {
      marcar(r.id, { estado: agotado(r) ? "agotado" : "vencido" });
    }
  }

  const correlativo = elegido.siguiente;
  marcar(elegido.id, { estado: "activo", siguiente: correlativo + 1 });

  if (correlativo + 1 > elegido.hasta) {
    marcar(elegido.id, { estado: "agotado" });
    const proximo = candidatos
      .filter((r) => r.id !== elegido.id && r.tipo_doc === elegido.tipo_doc && r.estado === "pendiente" && utilizable(r, ahora))
      .sort(porDesde)[0];
    if (proximo) marcar(proximo.id, { estado: "activo" });
  }

  return { rango: elegido, correlativo, cambios };
}

/** Rango tal como lo devuelve el servidor (lo que se mezcla con la copia local). */
export interface RangoRemoto extends RangoPlanificable {
  tenant_id: string;
}

/**
 * Mezcla un rango del servidor con su copia local sin NUNCA bajar el
 * correlativo: `siguiente = max(local, servidor, máximo emitido + 1)`.
 * El tercer término es la protección contra reuso: un dispositivo
 * reinstalado (o con la caché borrada) continúa después de lo ya emitido.
 * `maxEmitidoServidor` es el máximo correlativo del punto/tipo (0 si ninguno).
 */
export function fusionarRango<R extends RangoPlanificable>(
  local: R | undefined,
  remoto: R,
  maxEmitidoServidor: number
): R {
  const desdeServidor =
    maxEmitidoServidor >= remoto.desde && maxEmitidoServidor <= remoto.hasta
      ? maxEmitidoServidor + 1
      : maxEmitidoServidor > remoto.hasta
        ? remoto.hasta + 1
        : remoto.desde;

  const siguiente = Math.max(local?.siguiente ?? remoto.desde, remoto.siguiente, desdeServidor);

  let estado = remoto.estado;
  if (siguiente > remoto.hasta) estado = "agotado";
  // El dispositivo ya usó este rango (el anterior se agotó offline) pero el
  // servidor todavía lo ve pendiente: conservar activo hasta que sincronice.
  else if (local?.estado === "activo" && remoto.estado === "pendiente" && siguiente > remoto.desde) estado = "activo";

  return { ...remoto, siguiente, estado };
}
