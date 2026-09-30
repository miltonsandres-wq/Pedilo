import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";
import { obtenerOCrearCaja } from "./cajaPorDefecto";
import type { RangoValidado } from "./validaciones";

/**
 * Escrituras de configuración fiscal compartidas entre la pantalla de admin y el
 * asistente de configuración inicial (se ejecutan con el cliente del usuario:
 * la RLS sigue mandando). Solo para usar en el servidor.
 */

type Cliente = SupabaseClient<Database>;

export interface ResultadoConfig {
  ok: boolean;
  error?: string;
  errores?: Record<string, string>;
}

/** Convierte el error de la base a algo que el dueño entienda. */
export function mensajeDeErrorFiscal(e: { code?: string; message?: string } | null | undefined, porDefecto: string): string {
  const m = e?.message ?? "";
  if (e?.code === "23P01" || m.includes("cai_rangos_sin_traslape")) {
    return "Ese rango se traslapa con otro ya cargado para esta caja y este tipo de documento.";
  }
  if (e?.code === "23505" && m.includes("dispositivos_pos")) return "Ya existe una caja con ese establecimiento y punto de emisión.";
  if (m.includes("EN_USO")) return "El rango ya emitió documentos: no se puede borrar ni modificar.";
  if (m.includes("DISPOSITIVO_INCONSISTENTE")) return "La caja elegida no corresponde a ese establecimiento/punto.";
  return porDefecto;
}

export interface FilaEmisor {
  razon_social: string | null;
  nombre_comercial: string | null;
  rtn: string | null;
  direccion_fiscal: string | null;
  telefono: string | null;
  correo: string | null;
}

/** Datos fiscales del negocio (sucursalId = null) o de una sucursal (override). Crea o actualiza. */
export async function guardarDatosEmisor(
  supabase: Cliente,
  tenantId: string,
  sucursalId: string | null,
  fila: FilaEmisor
): Promise<ResultadoConfig> {
  let consulta = supabase.from("datos_fiscales_emisor").select("id").eq("tenant_id", tenantId);
  consulta = sucursalId ? consulta.eq("sucursal_id", sucursalId) : consulta.is("sucursal_id", null);
  const { data: existente } = await consulta.maybeSingle();

  const { error } = existente
    ? await supabase.from("datos_fiscales_emisor").update(fila).eq("id", existente.id)
    : await supabase.from("datos_fiscales_emisor").insert({ ...fila, tenant_id: tenantId, sucursal_id: sucursalId });

  return error ? { ok: false, error: "No se pudieron guardar los datos fiscales. Intenta de nuevo." } : { ok: true };
}

/** Carga un rango CAI ya validado en la caja de cobro de su sucursal (se crea sola si hiciera falta). */
export async function cargarRangoCai(supabase: Cliente, tenantId: string, v: RangoValidado): Promise<ResultadoConfig> {
  const { data: sucursal } = await supabase
    .from("sucursales")
    .select("id")
    .eq("id", v.sucursalId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const caja = sucursal ? await obtenerOCrearCaja(supabase, tenantId, sucursal.id) : null;
  if (!caja) return { ok: false, error: "La sucursal elegida no existe.", errores: { sucursalId: "Elige una sucursal válida." } };

  const { error } = await supabase.from("cai_rangos").insert({
    tenant_id: tenantId,
    sucursal_id: caja.sucursal_id,
    establecimiento: caja.establecimiento,
    punto_emision: caja.punto_emision,
    tipo_doc: v.tipoDoc,
    clase: v.clase,
    cai: v.cai,
    desde: v.desde,
    hasta: v.hasta,
    siguiente: v.desde,
    fecha_limite: v.fechaLimite,
    dispositivo_id: caja.id,
  });
  return error ? { ok: false, error: mensajeDeErrorFiscal(error, "No se pudo cargar el rango.") } : { ok: true };
}
