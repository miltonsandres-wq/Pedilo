"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fechaLocalHN } from "@/lib/fiscal/formato";
import { calcularRequisitos } from "@/lib/fiscal/requisitos";
import { cargarRangoCai, guardarDatosEmisor, mensajeDeErrorFiscal } from "@/lib/fiscal/configurar";
import { validarEmisor, validarEntradaRango } from "@/lib/fiscal/validaciones";

/** Resultado que las pantallas muestran debajo del formulario. */
export interface EstadoAccion {
  ok: boolean;
  mensaje?: string;
  error?: string;
  errores?: Record<string, string>;
}

const texto = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const RUTA = "/admin/fiscal";

// --- Ticket sin factura (lo activa el dueño) ----------------------------------------

/** Permite (o no) cobrar con «ticket sin factura» en este negocio. Además, cada cajero necesita su permiso. */
export async function guardarTicketSinFactura(formData: FormData): Promise<void> {
  const sesion = await requireAdmin();
  const supabase = await createClient();
  await supabase
    .from("tenants")
    .update({ ticket_sin_factura_activo: formData.get("ticket_sin_factura") === "on" })
    .eq("id", sesion.tenant_id);
  revalidatePath(RUTA);
}

// --- Activación ----------------------------------------------------------------

export async function activarFacturacion(_prev: EstadoAccion | null, formData: FormData): Promise<EstadoAccion> {
  const sesion = await requireAdmin();
  const supabase = await createClient();
  const activar = texto(formData, "activar") === "true";

  if (!activar) {
    if (texto(formData, "confirmar") !== "on") {
      return { ok: false, error: "Marca la casilla para confirmar que dejarás de emitir facturas fiscales." };
    }
  } else {
    const [{ data: sucursales }, { data: emisores }, { data: rangos }] = await Promise.all([
      supabase.from("sucursales").select("id, nombre").eq("tenant_id", sesion.tenant_id).eq("activo", true),
      supabase.from("datos_fiscales_emisor").select("sucursal_id, razon_social, rtn, direccion_fiscal").eq("tenant_id", sesion.tenant_id),
      supabase.from("cai_rangos").select("sucursal_id, clase, estado, siguiente, hasta, fecha_limite").eq("tenant_id", sesion.tenant_id),
    ]);
    const pendientes = calcularRequisitos(
      { sucursales: sucursales ?? [], emisores: emisores ?? [], rangos: rangos ?? [] },
      fechaLocalHN(new Date())
    ).filter((r) => !r.cumple);
    if (pendientes.length > 0) {
      return { ok: false, error: `Todavía no se puede activar. ${pendientes.map((p) => p.texto).join(" ")}` };
    }
  }

  const { error } = await supabase.from("tenants").update({ facturacion_fiscal_activa: activar }).eq("id", sesion.tenant_id);
  if (error) return { ok: false, error: "No se pudo cambiar el estado. Intenta de nuevo." };

  revalidatePath("/admin", "layout");
  return { ok: true, mensaje: activar ? "Facturación fiscal activada." : "Facturación fiscal desactivada." };
}

// --- Emisor --------------------------------------------------------------------

export async function guardarEmisor(_prev: EstadoAccion | null, formData: FormData): Promise<EstadoAccion> {
  const sesion = await requireAdmin();
  const supabase = await createClient();
  const sucursalId = texto(formData, "sucursal_id") || null;

  const v = validarEmisor(
    {
      razonSocial: texto(formData, "razon_social"),
      nombreComercial: texto(formData, "nombre_comercial"),
      rtn: texto(formData, "rtn"),
      direccionFiscal: texto(formData, "direccion_fiscal"),
      telefono: texto(formData, "telefono"),
      correo: texto(formData, "correo"),
    },
    { esOverrideDeSucursal: sucursalId !== null }
  );
  if (!v.ok || !v.valor) return { ok: false, error: "Revisa los campos marcados.", errores: v.errores };

  const fila = {
    razon_social: v.valor.razonSocial,
    nombre_comercial: v.valor.nombreComercial,
    rtn: v.valor.rtn,
    direccion_fiscal: v.valor.direccionFiscal,
    telefono: v.valor.telefono,
    correo: v.valor.correo,
  };

  const res = await guardarDatosEmisor(supabase, sesion.tenant_id, sucursalId, fila);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath(RUTA, "layout");
  return { ok: true, mensaje: "Datos fiscales guardados." };
}

// --- Caja de cobro de cada sucursal (se crea sola) ---------------------------------

/** Desvincula la caja física: la próxima vez que se abra el POS deberá vincularse de nuevo. */
export async function liberarDispositivo(id: string): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("dispositivos_pos").update({ vinculo_hash: null, vinculado_at: null }).eq("id", id);
  revalidatePath(RUTA, "layout");
}

// --- Rangos CAI ------------------------------------------------------------------

export async function crearRango(_prev: EstadoAccion | null, formData: FormData): Promise<EstadoAccion> {
  const sesion = await requireAdmin();
  const supabase = await createClient();

  const v = validarEntradaRango(
    {
      clase: texto(formData, "clase"),
      tipoDoc: texto(formData, "tipo_doc"),
      cai: texto(formData, "cai"),
      desde: texto(formData, "desde"),
      hasta: texto(formData, "hasta"),
      fechaLimite: texto(formData, "fecha_limite"),
      sucursalId: texto(formData, "sucursal_id"),
    },
    fechaLocalHN(new Date())
  );
  if (!v.ok || !v.valor) return { ok: false, error: "Revisa los campos marcados.", errores: v.errores };

  const res = await cargarRangoCai(supabase, sesion.tenant_id, v.valor);
  if (!res.ok) return { ok: false, error: res.error, errores: res.errores };

  revalidatePath(RUTA, "layout");
  return { ok: true, mensaje: "Rango cargado. Si la caja no tenía uno activo, ya quedó activo." };
}

export async function eliminarRango(id: string): Promise<EstadoAccion> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("cai_rangos").delete().eq("id", id);
  if (error) return { ok: false, error: mensajeDeErrorFiscal(error, "No se pudo borrar el rango.") };
  revalidatePath(RUTA, "layout");
  return { ok: true };
}

// --- Incidentes y anulación ------------------------------------------------------

export async function resolverIncidente(id: string): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("incidentes_fiscales").update({ resuelto: true }).eq("id", id);
  revalidatePath(RUTA, "layout");
}

/** Anula un documento: conserva su número con estado 'anulada', motivo, fecha y usuario. Solo admin. */
export async function anularDocumento(_prev: EstadoAccion | null, formData: FormData): Promise<EstadoAccion> {
  await requireAdmin();
  const supabase = await createClient();
  const id = texto(formData, "id");
  const motivo = texto(formData, "motivo").trim();
  if (!motivo) return { ok: false, error: "Indica el motivo de la anulación." };

  const { error } = await supabase.rpc("anular_documento_fiscal", { p_id: id, p_motivo: motivo });
  if (error) {
    const m = error.message;
    if (m.includes("YA_ANULADO")) return { ok: false, error: "Ese documento ya estaba anulado." };
    if (m.includes("SOLO_ADMIN")) return { ok: false, error: "Solo un administrador puede anular documentos fiscales." };
    return { ok: false, error: "No se pudo anular el documento." };
  }
  revalidatePath(RUTA, "layout");
  return { ok: true, mensaje: "Documento anulado." };
}
