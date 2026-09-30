import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";
import { armarLibro, type DocumentoLibro, type Libro } from "./libro";
import { limitesPeriodoHN } from "./formato";

export const LIMITE_LIBRO = 5000;

/** Documentos fiscales del negocio en un periodo (días locales de Honduras), incluidos los anulados. */
export async function consultarLibro(
  supabase: SupabaseClient<Database>,
  params: { tenantId: string; desde: string; hasta: string; sucursalId?: string | null }
): Promise<{ libro: Libro; truncado: boolean }> {
  const { inicioIso, finIso } = limitesPeriodoHN(params.desde, params.hasta);

  let consulta = supabase
    .from("documentos_fiscales")
    .select(
      "id, fecha_emision, numero_completo, clase, estado, cliente_nombre, cliente_rtn, importe_exonerado, importe_exento, gravado_15, gravado_18, isv_15, isv_18, cargo_servicio, total, anulada_motivo, documento_referencia_id"
    )
    .eq("tenant_id", params.tenantId)
    .gte("fecha_emision", inicioIso)
    .lt("fecha_emision", finIso)
    .order("fecha_emision", { ascending: true })
    .limit(LIMITE_LIBRO + 1);
  if (params.sucursalId) consulta = consulta.eq("sucursal_id", params.sucursalId);

  const { data } = await consulta;
  const filas = (data ?? []) as DocumentoLibro[];
  return { libro: armarLibro(filas.slice(0, LIMITE_LIBRO)), truncado: filas.length > LIMITE_LIBRO };
}
