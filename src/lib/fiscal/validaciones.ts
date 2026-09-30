import { esCaiValido, esRtnValido, normalizarCai, normalizarRtn, validarRango } from "./formato";

/**
 * Validaciones de los formularios de administración fiscal. Son puras: la UI
 * las usa en vivo mientras se escribe y las server actions las repiten antes
 * de tocar la base (la base tiene sus propias restricciones como último muro).
 */

export type Errores<K extends string> = Partial<Record<K, string>>;

export interface ResultadoValidacion<T, K extends string> {
  ok: boolean;
  errores: Errores<K>;
  valor?: T;
}

// --- Rango CAI ----------------------------------------------------------------

export type ClaseDocumentoForm = "factura" | "nota_credito" | "nota_debito";

export interface EntradaRango {
  clase: string;
  tipoDoc: string;
  cai: string;
  desde: string;
  hasta: string;
  fechaLimite: string;
  dispositivoId: string;
}

export interface RangoValidado {
  clase: ClaseDocumentoForm;
  tipoDoc: string;
  cai: string;
  desde: number;
  hasta: number;
  fechaLimite: string;
  dispositivoId: string;
}

export type CampoRango = keyof EntradaRango;

/** `hoyHN` = fecha local de Honduras (YYYY-MM-DD). */
export function validarEntradaRango(
  e: EntradaRango,
  hoyHN: string
): ResultadoValidacion<RangoValidado, CampoRango> {
  const errores: Errores<CampoRango> = {};

  if (!e.dispositivoId) errores.dispositivoId = "Elige la caja (punto de emisión) a la que pertenece este rango.";

  if (!["factura", "nota_credito", "nota_debito"].includes(e.clase)) errores.clase = "Elige el tipo de documento.";

  const tipo = e.tipoDoc.trim();
  if (!/^\d{2}$/.test(tipo)) errores.tipoDoc = "El código del documento tiene 2 dígitos (ej. 01).";
  // La factura es SIEMPRE 01; los códigos de notas los define quien carga el rango
  else if (e.clase === "factura" && tipo !== "01") errores.tipoDoc = "El código de la factura es 01.";
  else if (e.clase !== "factura" && tipo === "01") errores.tipoDoc = "El 01 es de la factura; usa el código que te dio el SAR para este documento.";

  if (!e.cai.trim()) errores.cai = "Escribe el CAI que autorizó el SAR.";
  else if (!esCaiValido(e.cai)) errores.cai = "Formato inválido. Debe ser XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XX (letras A-F y números).";

  const desde = Number(e.desde);
  const hasta = Number(e.hasta);
  if (e.desde.trim() === "" || e.hasta.trim() === "") {
    if (e.desde.trim() === "") errores.desde = "Escribe el número inicial.";
    if (e.hasta.trim() === "") errores.hasta = "Escribe el número final.";
  } else {
    const problema = validarRango({ desde, hasta });
    if (problema) errores.hasta = problema;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.fechaLimite)) errores.fechaLimite = "Elige la fecha límite de emisión.";
  else if (e.fechaLimite < hoyHN) errores.fechaLimite = "La fecha límite ya pasó: ese CAI no se puede usar.";

  if (Object.keys(errores).length > 0) return { ok: false, errores };
  return {
    ok: true,
    errores,
    valor: {
      clase: e.clase as ClaseDocumentoForm,
      tipoDoc: tipo,
      cai: normalizarCai(e.cai),
      desde,
      hasta,
      fechaLimite: e.fechaLimite,
      dispositivoId: e.dispositivoId,
    },
  };
}

// --- Datos del emisor ---------------------------------------------------------

export interface EntradaEmisor {
  razonSocial: string;
  nombreComercial: string;
  rtn: string;
  direccionFiscal: string;
  telefono: string;
  correo: string;
}

export type CampoEmisor = keyof EntradaEmisor;

export function validarEmisor(
  e: EntradaEmisor,
  opciones: { esOverrideDeSucursal?: boolean } = {}
): ResultadoValidacion<Record<CampoEmisor, string | null>, CampoEmisor> {
  const errores: Errores<CampoEmisor> = {};

  // En el override de una sucursal todo es opcional: lo vacío hereda del negocio
  if (!opciones.esOverrideDeSucursal) {
    if (!e.razonSocial.trim()) errores.razonSocial = "La razón social es obligatoria.";
    if (!e.rtn.trim()) errores.rtn = "El RTN es obligatorio.";
    if (!e.direccionFiscal.trim()) errores.direccionFiscal = "La dirección fiscal es obligatoria.";
  }
  if (e.rtn.trim() && !esRtnValido(e.rtn)) errores.rtn = "El RTN debe tener 14 dígitos.";
  if (e.correo.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.correo.trim())) errores.correo = "El correo no parece válido.";

  if (Object.keys(errores).length > 0) return { ok: false, errores };
  const vacio = (v: string) => (v.trim() ? v.trim() : null);
  return {
    ok: true,
    errores,
    valor: {
      razonSocial: vacio(e.razonSocial),
      nombreComercial: vacio(e.nombreComercial),
      rtn: e.rtn.trim() ? normalizarRtn(e.rtn) : null,
      direccionFiscal: vacio(e.direccionFiscal),
      telefono: vacio(e.telefono),
      correo: vacio(e.correo),
    },
  };
}

// --- Caja / dispositivo -------------------------------------------------------

export interface EntradaDispositivo {
  nombre: string;
  sucursalId: string;
  establecimiento: string;
  puntoEmision: string;
}

export type CampoDispositivo = keyof EntradaDispositivo;

export function validarDispositivo(
  e: EntradaDispositivo
): ResultadoValidacion<{ nombre: string; sucursalId: string; establecimiento: string; puntoEmision: string }, CampoDispositivo> {
  const errores: Errores<CampoDispositivo> = {};
  if (!e.nombre.trim()) errores.nombre = "Ponle un nombre a la caja (ej. Caja 1).";
  if (!e.sucursalId) errores.sucursalId = "Elige la sucursal.";
  if (!/^\d{1,3}$/.test(e.establecimiento.trim())) errores.establecimiento = "El establecimiento son hasta 3 dígitos (000 = casa matriz).";
  if (!/^\d{1,3}$/.test(e.puntoEmision.trim())) errores.puntoEmision = "El punto de emisión son hasta 3 dígitos (ej. 001).";
  if (Object.keys(errores).length > 0) return { ok: false, errores };
  return {
    ok: true,
    errores,
    valor: {
      nombre: e.nombre.trim(),
      sucursalId: e.sucursalId,
      establecimiento: e.establecimiento.trim().padStart(3, "0"),
      puntoEmision: e.puntoEmision.trim().padStart(3, "0"),
    },
  };
}
