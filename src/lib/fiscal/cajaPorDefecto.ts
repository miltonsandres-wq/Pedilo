import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";

/**
 * Cada sucursal factura desde UNA caja (punto de emisión), creada sola: así el
 * dueño no tiene que saber qué es un "punto de emisión". Establecimiento: el
 * primer número libre del negocio (000 = casa matriz, 001, 002…); punto 001.
 */
export function siguienteEstablecimiento(existentes: { establecimiento: string; punto_emision: string }[]): string {
  const usados = new Set(existentes.filter((c) => c.punto_emision === "001").map((c) => c.establecimiento));
  let n = 0;
  while (usados.has(String(n).padStart(3, "0"))) n++;
  return String(n).padStart(3, "0");
}

/** La caja de cobro de la sucursal; si por algún motivo no existe, la crea. */
export async function obtenerOCrearCaja(supabase: SupabaseClient<Database>, tenantId: string, sucursalId: string) {
  const { data: todas } = await supabase.from("dispositivos_pos").select("*").eq("tenant_id", tenantId).order("created_at");
  const propias = (todas ?? []).filter((c) => c.sucursal_id === sucursalId);
  const caja = propias.find((c) => c.activo) ?? propias[0];
  if (caja) return caja;

  const { data: nueva } = await supabase
    .from("dispositivos_pos")
    .insert({
      tenant_id: tenantId,
      sucursal_id: sucursalId,
      nombre: "Caja principal",
      establecimiento: siguienteEstablecimiento(todas ?? []),
      punto_emision: "001",
    })
    .select("*")
    .single();
  return nueva ?? null;
}
