import { db, type DocumentoFiscalLocal } from "@/lib/offline/db";
import { flushOutbox } from "@/lib/offline/outbox";
import { emitirDocumentoFiscal } from "./emision";
import { FiscalError } from "./rangos";

/**
 * Nota de crédito TOTAL sobre una factura vigente. Es un documento propio: usa
 * su propio rango CAI (clase "nota_credito", con el código que el SAR le dio a
 * ese negocio) y copia EXACTO los montos y líneas de la factura, referenciando
 * su número, CAI y fecha. La factura original no se toca ni se anula.
 *
 * Solo se puede acreditar una vez cada factura, y solo facturas que este
 * dispositivo tiene (se guardan los últimos 7 días).
 * (Las notas parciales no están soportadas: se acredita la factura completa.)
 */
export async function emitirNotaCredito(params: {
  facturaId: string;
  usuarioId: string | null;
  motivo: string;
  ahora?: Date;
}): Promise<DocumentoFiscalLocal> {
  const motivo = params.motivo.trim();
  if (!motivo) throw new FiscalError("motivo_requerido", "Indica el motivo de la nota de crédito.");

  const nota = await db.transaction("rw", [db.rangos_cai, db.documentos_fiscales, db.config, db.outbox], async () => {
    const factura = await db.documentos_fiscales.get(params.facturaId);
    if (!factura) {
      throw new FiscalError(
        "documento_no_encontrado",
        "Esa factura no está en este dispositivo (solo se guardan los últimos 7 días). Abre el POS de la caja que la emitió."
      );
    }
    if (factura.clase !== "factura" || factura.estado !== "emitida") {
      throw new FiscalError("factura_invalida", "Solo se puede acreditar una factura vigente (no anulada).");
    }
    if (factura.sync_estado === "conflicto") {
      throw new FiscalError("factura_invalida", "Esa factura fue rechazada por el servidor: revisa el incidente en Admin antes de acreditarla.");
    }

    const yaAcreditada = (await db.documentos_fiscales.where("orden_id").equals(factura.orden_id).toArray()).some(
      (d) => d.clase === "nota_credito" && d.estado === "emitida" && d.documento_referencia_id === factura.id
    );
    if (yaAcreditada) throw new FiscalError("ya_acreditado", "Esa factura ya tiene una nota de crédito.");

    const esConsumidorFinal = factura.cliente_nombre === "Consumidor Final" && !factura.cliente_rtn;
    return emitirDocumentoFiscal({
      ordenId: factura.orden_id,
      sucursalId: factura.sucursal_id,
      usuarioId: params.usuarioId,
      clase: "nota_credito",
      documentoReferenciaId: factura.id,
      motivoNota: motivo,
      cliente: esConsumidorFinal ? undefined : { nombre: factura.cliente_nombre, rtn: factura.cliente_rtn ?? undefined },
      exoneracion: {
        noOrdenCompraExenta: factura.no_orden_compra_exenta ?? undefined,
        noConstanciaExonerado: factura.no_constancia_exonerado ?? undefined,
        noRegistroSag: factura.no_registro_sag ?? undefined,
      },
      contenido: {
        importeExonerado: factura.importe_exonerado,
        importeExento: factura.importe_exento,
        gravado15: factura.gravado_15,
        gravado18: factura.gravado_18,
        isv15: factura.isv_15,
        isv18: factura.isv_18,
        cargoServicio: factura.cargo_servicio,
        total: factura.total,
        lineas: factura.lineas,
      },
      ahora: params.ahora,
    });
  });

  void flushOutbox();
  return nota;
}
