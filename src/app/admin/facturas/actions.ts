"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const RUTA = "/admin/facturas";

function volver(tipo: "ok" | "error", mensaje: string, fecha?: string): never {
  const params = new URLSearchParams({ [tipo]: mensaje });
  if (fecha) params.set("fecha", fecha);
  redirect(`${RUTA}?${params.toString()}`);
}

/**
 * El administrador aprueba o rechaza una solicitud de anulación de caja.
 *  - Aprobar una factura con CAI la marca «anulada» (conserva su número, motivo, fecha y quién la anuló).
 *  - Aprobar un cobro sin CAI lo deja registrado como anulado (no hay documento fiscal que anular).
 *  - Rechazar exige una razón, que la caja ve en su lista.
 */
export async function resolverSolicitudAnulacion(formData: FormData) {
  const sesion = await requireAdmin();
  const supabase = await createClient();
  const fecha = String(formData.get("fecha") ?? "") || undefined;

  const id = String(formData.get("id") ?? "");
  const aprobar = formData.get("decision") === "aprobar";
  const razon = String(formData.get("respuesta") ?? "").trim();
  if (!id) volver("error", "Falta la solicitud.", fecha);
  if (!aprobar && !razon) volver("error", "Escribe la razón para rechazar la anulación.", fecha);

  const { data: solicitud } = await supabase
    .from("solicitudes_anulacion")
    .select("id, estado, documento_id, referencia, motivo")
    .eq("id", id)
    .maybeSingle();
  if (!solicitud) volver("error", "No se encontró la solicitud.", fecha);
  if (solicitud.estado !== "pendiente") volver("error", "Esa solicitud ya fue resuelta.", fecha);

  if (aprobar && solicitud.documento_id) {
    const motivoFiscal = `Anulación solicitada por caja: ${solicitud.motivo}${razon ? ` · Aprobada: ${razon}` : ""}`;
    const { error } = await supabase.rpc("anular_documento_fiscal", { p_id: solicitud.documento_id, p_motivo: motivoFiscal });
    const m = error?.message ?? "";
    // «Ya anulado» no es un problema: la solicitud igual se da por aprobada
    if (error && !m.includes("YA_ANULADO")) {
      if (m.includes("NO_ENCONTRADO")) {
        volver("error", "La factura todavía no llegó al servidor (la caja no ha sincronizado). Inténtalo en unos minutos.", fecha);
      }
      volver("error", "No se pudo anular la factura. Inténtalo de nuevo.", fecha);
    }
  }

  const { error: errUpd } = await supabase
    .from("solicitudes_anulacion")
    .update({
      estado: aprobar ? "aprobada" : "rechazada",
      respuesta: razon || null,
      resuelta_por: sesion.id,
      resuelta_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("estado", "pendiente");
  if (errUpd) volver("error", "No se pudo guardar la decisión. Inténtalo de nuevo.", fecha);

  revalidatePath(RUTA);
  revalidatePath("/admin", "layout");
  volver("ok", aprobar ? `Anulación aprobada (${solicitud.referencia}).` : `Anulación rechazada (${solicitud.referencia}).`, fecha);
}
