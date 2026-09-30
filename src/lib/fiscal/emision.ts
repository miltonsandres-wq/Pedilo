import Dexie from "dexie";
import { db, type DocumentoFiscalLocal, type OrdenItemLocal, type RangoCaiLocal } from "@/lib/offline/db";
import { encolarSinFlush, flushOutbox } from "@/lib/offline/outbox";
import { calcularImpuestos, type LineaFiscal, type OpcionesImpuestos, type TasaIsv } from "./impuestos";
import { esRtnValido, formatearNumeroDocumento, normalizarRtn } from "./formato";
import { FiscalError, planificarEmision, type ClaseDocumento } from "./rangos";
import { totalEnLetras } from "./totalLetras";

export interface EmisorSnapshot {
  razon_social: string | null;
  nombre_comercial: string | null;
  rtn: string | null;
  direccion_fiscal: string | null;
  telefono: string | null;
  correo: string | null;
  logo_url: string | null;
}

export interface DispositivoLocal {
  id: string;
  nombre: string;
  sucursal_id: string;
  establecimiento: string;
  punto_emision: string;
}

/** Config fiscal cacheada en Dexie (clave "fiscal"): la escribe iniciarSync. */
export interface ConfigFiscalLocal {
  activa: boolean;
  tenantId: string;
  emisor: EmisorSnapshot | null;
  /** Logo para imprimir: el de la sucursal y, si no tiene, el del negocio. */
  logoUrl?: string | null;
  dispositivo: DispositivoLocal | null;
}

export const CLAVE_CONFIG_FISCAL = "fiscal";

export async function leerConfigFiscal(): Promise<ConfigFiscalLocal | null> {
  const entry = await db.config.get(CLAVE_CONFIG_FISCAL);
  return (entry?.valor as ConfigFiscalLocal | undefined) ?? null;
}

export interface DatosCliente {
  nombre?: string;
  rtn?: string;
}

export interface DatosExoneracion {
  noOrdenCompraExenta?: string;
  noConstanciaExonerado?: string;
  noRegistroSag?: string;
}

/** Montos y líneas ya definidos (una nota de crédito copia EXACTO los de su factura). */
export interface ContenidoFijo {
  importeExonerado: number;
  importeExento: number;
  gravado15: number;
  gravado18: number;
  isv15: number;
  isv18: number;
  cargoServicio: number;
  total: number;
  lineas: DocumentoFiscalLocal["lineas"];
}

export interface DatosEmision {
  ordenId: string;
  sucursalId: string;
  usuarioId: string | null;
  lineas?: LineaFiscal[];
  /** Si viene, se usa tal cual en vez de calcular impuestos desde `lineas`. */
  contenido?: ContenidoFijo;
  motivoNota?: string;
  opciones?: Omit<OpcionesImpuestos, "exonerado">;
  cliente?: DatosCliente;
  exoneracion?: DatosExoneracion;
  clase?: ClaseDocumento;
  documentoReferenciaId?: string;
  ahora?: Date;
}

const TABLAS_EMISION = () => [db.rangos_cai, db.documentos_fiscales, db.config, db.outbox];

const vacioANulo = (v: string | undefined) => (v?.trim() ? v.trim() : null);

/** Valida que la config permita emitir. Devuelve la config y el dispositivo ya resueltos. */
function requerirConfig(config: ConfigFiscalLocal | null) {
  if (!config?.dispositivo) {
    throw new FiscalError(
      "sin_dispositivo",
      "Esta caja no está vinculada a un punto de emisión. Vincúlala desde el aviso rojo del POS antes de cobrar."
    );
  }
  const e = config.emisor;
  if (!e?.razon_social || !e.rtn || !e.direccion_fiscal) {
    throw new FiscalError(
      "sin_emisor",
      "Faltan datos fiscales del negocio (razón social, RTN y dirección). Complétalos en Admin > Facturación fiscal."
    );
  }
  return { dispositivo: config.dispositivo, emisor: e };
}

/**
 * Evalúa con los datos ya leídos si se podría facturar AHORA (config + rangos).
 * Devuelve el FiscalError que bloquearía la emisión, o null si todo bien. Si
 * el negocio no tiene facturación activa, nunca bloquea. Es síncrona a
 * propósito: el cobro y el banner del POS la reutilizan.
 */
export function evaluarFacturacion(
  config: ConfigFiscalLocal | null | undefined,
  rangos: RangoCaiLocal[],
  clase: ClaseDocumento = "factura",
  ahora = new Date()
): FiscalError | null {
  if (!config?.activa) return null;
  try {
    const { dispositivo } = requerirConfig(config);
    planificarEmision(
      rangos.filter((r) => r.establecimiento === dispositivo.establecimiento && r.punto_emision === dispositivo.punto_emision),
      clase,
      ahora
    );
    return null;
  } catch (e) {
    if (e instanceof FiscalError) return e;
    throw e;
  }
}

/**
 * Comprueba que se podría facturar AHORA sin escribir nada: lo usa el cobro
 * antes de aceptar cualquier pago (lee de Dexie).
 */
export async function verificarPuedeFacturar(
  clase: ClaseDocumento = "factura",
  ahora = new Date()
): Promise<FiscalError | null> {
  return evaluarFacturacion(await leerConfigFiscal(), await db.rangos_cai.toArray(), clase, ahora);
}

/**
 * Emite un documento fiscal: asigna el correlativo EN ESTE DISPOSITIVO, dentro
 * de una transacción Dexie atómica, y lo encola para el servidor. Nunca se
 * asigna al sincronizar. Si no hay rango vigente lanza FiscalError y no
 * escribe nada.
 *
 * Puede llamarse dentro de otra transacción (ver cobrar()): en ese caso se une
 * a ella y el llamador debe hacer flushOutbox() cuando la transacción termine.
 * Llamada suelta, hace el flush ella misma.
 */
export async function emitirDocumentoFiscal(datos: DatosEmision): Promise<DocumentoFiscalLocal> {
  const yaEnTransaccion = Dexie.currentTransaction != null;

  const doc = await db.transaction("rw", TABLAS_EMISION(), async () => {
    const ahora = datos.ahora ?? new Date();
    const clase = datos.clase ?? "factura";
    const config = await leerConfigFiscal();
    const { dispositivo, emisor } = requerirConfig(config);

    if (!datos.contenido && !datos.lineas?.length) {
      throw new FiscalError("sin_lineas", "La orden no tiene productos para facturar.");
    }

    const nombreCliente = vacioANulo(datos.cliente?.nombre);
    const rtnCliente = vacioANulo(datos.cliente?.rtn);
    if (rtnCliente && !esRtnValido(rtnCliente)) {
      throw new FiscalError("cliente_invalido", "El RTN del cliente debe tener 14 dígitos.");
    }
    if (rtnCliente && !nombreCliente) {
      throw new FiscalError("cliente_invalido", "Indica el nombre del cliente para facturar con RTN.");
    }

    const ex = datos.exoneracion ?? {};
    const exonerado = !!(vacioANulo(ex.noOrdenCompraExenta) || vacioANulo(ex.noConstanciaExonerado) || vacioANulo(ex.noRegistroSag));

    const rangos = (await db.rangos_cai.toArray()).filter(
      (r) => r.establecimiento === dispositivo.establecimiento && r.punto_emision === dispositivo.punto_emision
    );
    const plan = planificarEmision(rangos, clase, ahora);

    // Factura normal: se calculan los impuestos. Nota: se copian los montos de su factura.
    let calculo: ContenidoFijo;
    if (datos.contenido) {
      calculo = datos.contenido;
    } else {
      const c = calcularImpuestos(datos.lineas ?? [], { ...datos.opciones, exonerado });
      calculo = {
        importeExonerado: c.importeExonerado,
        importeExento: c.importeExento,
        gravado15: c.gravado15,
        gravado18: c.gravado18,
        isv15: c.isv15,
        isv18: c.isv18,
        cargoServicio: c.cargoServicio,
        total: c.total,
        lineas: c.lineas.map((l) => ({
          nombre: l.nombre,
          cantidad: l.cantidad,
          precio_unitario: l.precioUnitario,
          total: l.totalLinea,
          tasa: l.tasa,
        })),
      };
    }

    for (const [id, cambio] of Object.entries(plan.cambios)) {
      await db.rangos_cai.update(id, cambio);
    }

    const r = plan.rango;
    const nuevo: DocumentoFiscalLocal = {
      id: crypto.randomUUID(),
      tenant_id: config!.tenantId,
      sucursal_id: datos.sucursalId,
      orden_id: datos.ordenId,
      dispositivo_id: dispositivo.id,
      rango_id: r.id,
      usuario_id: datos.usuarioId,
      clase,
      tipo_doc: r.tipo_doc,
      establecimiento: r.establecimiento,
      punto_emision: r.punto_emision,
      correlativo: plan.correlativo,
      numero_completo: formatearNumeroDocumento({
        establecimiento: r.establecimiento,
        puntoEmision: r.punto_emision,
        tipoDoc: r.tipo_doc,
        correlativo: plan.correlativo,
      }),
      cai: r.cai,
      rango_desde: r.desde,
      rango_hasta: r.hasta,
      fecha_limite: r.fecha_limite,
      fecha_emision: ahora.toISOString(),
      emisor_snapshot: emisor as unknown as DocumentoFiscalLocal["emisor_snapshot"],
      cliente_nombre: nombreCliente ?? "Consumidor Final",
      cliente_rtn: rtnCliente ? normalizarRtn(rtnCliente) : null,
      no_orden_compra_exenta: vacioANulo(ex.noOrdenCompraExenta),
      no_constancia_exonerado: vacioANulo(ex.noConstanciaExonerado),
      no_registro_sag: vacioANulo(ex.noRegistroSag),
      importe_exonerado: calculo.importeExonerado,
      importe_exento: calculo.importeExento,
      gravado_15: calculo.gravado15,
      gravado_18: calculo.gravado18,
      isv_15: calculo.isv15,
      isv_18: calculo.isv18,
      cargo_servicio: calculo.cargoServicio,
      total: calculo.total,
      total_letras: totalEnLetras(calculo.total),
      lineas: calculo.lineas,
      estado: "emitida",
      anulada_motivo: null,
      anulada_at: null,
      anulada_por: null,
      documento_referencia_id: datos.documentoReferenciaId ?? null,
      motivo_nota: vacioANulo(datos.motivoNota),
      created_at: ahora.toISOString(),
      sync_estado: "pendiente",
      sync_detalle: null,
    };

    await db.documentos_fiscales.add(nuevo);

    // El servidor no conoce los campos de sincronización locales
    const payload: Record<string, unknown> = { ...nuevo };
    delete payload.sync_estado;
    delete payload.sync_detalle;
    await encolarSinFlush("documentos_fiscales", "insert", nuevo.id, payload);
    return nuevo;
  });

  if (!yaEnTransaccion) void flushOutbox();
  return doc;
}

/** Convierte los ítems de una orden en líneas fiscales (tasa capturada al agregar el ítem). */
export function lineasDesdeItems(items: OrdenItemLocal[]): LineaFiscal[] {
  return items.map((i) => ({
    nombre: i.nombre_producto,
    cantidad: i.cantidad,
    precioUnitario: i.precio_unitario,
    tasa: (i.tasa_isv as TasaIsv | undefined) ?? "15",
  }));
}
