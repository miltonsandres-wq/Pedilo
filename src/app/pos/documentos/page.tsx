import { requireSucursal } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ListaDocumentos } from "@/components/pos/ListaDocumentos";
import { CobrosSinFactura } from "@/components/pos/CobrosSinFactura";
import { cargarVentasDelDia } from "@/lib/ventas/cargar";
import { hoyHN } from "@/lib/menu/platosDelDia";
import type { SolicitudResumen } from "@/components/pos/SolicitarAnulacion";
import type { RolUsuario } from "@/lib/types/helpers";

export default async function DocumentosPage() {
  const sesion = await requireSucursal();
  const supabase = await createClient();
  const rol = sesion.rol as RolUsuario;

  // Solicitudes de anulación de esta sucursal (la última de cada orden) y los cobros de hoy sin CAI
  const desde = new Date(Date.now() - 8 * 86_400_000).toISOString();
  const [{ data: solicitudes }, ventas] = await Promise.all([
    supabase
      .from("solicitudes_anulacion")
      .select("orden_id, estado, motivo, respuesta, created_at")
      .eq("sucursal_id", sesion.sucursal_id)
      .gte("created_at", desde)
      .order("created_at", { ascending: false }),
    cargarVentasDelDia(supabase, { fecha: hoyHN(), sucursalId: sesion.sucursal_id }),
  ]);

  const porOrden: Record<string, SolicitudResumen> = {};
  for (const s of solicitudes ?? []) {
    porOrden[s.orden_id] ??= {
      orden_id: s.orden_id,
      estado: s.estado as SolicitudResumen["estado"],
      motivo: s.motivo,
      respuesta: s.respuesta,
    };
  }

  return (
    <>
      <ListaDocumentos sucursalId={sesion.sucursal_id} usuarioId={sesion.id} rol={rol} solicitudes={porOrden} />
      <div className="mx-auto max-w-2xl">
        <CobrosSinFactura ventas={ventas.filter((v) => v.tipo !== "con_cai")} puedeSolicitar={rol === "cajero"} />
      </div>
    </>
  );
}
