import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { obtenerOrigen, qrParaImprimir, urlCartaMesa } from "@/lib/qr";
import { mensajeParaFlyer } from "@/lib/flyer/mensaje";
import { PageHeader } from "@/components/ui/Card";
import { FlyersImprimibles } from "@/components/admin/FlyersImprimibles";
import type { DatosFlyer } from "@/components/admin/FlyerMesa";

/**
 * Flyers imprimibles del QR de las mesas de una sucursal (o de una sola mesa con ?mesa=).
 * El logo y el mensaje salen de la sucursal; el mensaje se edita en Admin > Mesas.
 */
export default async function FlyerMesasPage({
  searchParams,
}: {
  searchParams: Promise<{ sucursal?: string; mesa?: string }>;
}) {
  const sesion = await requireAdmin();
  const supabase = await createClient();
  const { sucursal: sucursalParam, mesa: mesaParam } = await searchParams;

  // Con ?mesa= se deduce la sucursal de esa mesa
  let sucursalId = sucursalParam;
  if (mesaParam) {
    const { data: m } = await supabase.from("mesas").select("sucursal_id").eq("id", mesaParam).eq("tenant_id", sesion.tenant_id).maybeSingle();
    if (!m) notFound();
    sucursalId = m.sucursal_id;
  }
  if (!sucursalId) notFound();

  const [{ data: sucursal }, { data: tenant }, { data: mesas }] = await Promise.all([
    supabase.from("sucursales").select("id, nombre, direccion, telefono, logo_url, mensaje_flyer").eq("id", sucursalId).eq("tenant_id", sesion.tenant_id).maybeSingle(),
    supabase.from("tenants").select("logo_url").eq("id", sesion.tenant_id).maybeSingle(),
    supabase.from("mesas").select("id, nombre, qr_token").eq("sucursal_id", sucursalId).eq("activa", true).order("nombre"),
  ]);
  if (!sucursal) notFound();

  const origen = await obtenerOrigen();
  const elegidas = (mesas ?? []).filter((m) => !mesaParam || m.id === mesaParam);
  const detalle = [sucursal.direccion, sucursal.telefono].filter(Boolean).join(" · ") || null;
  const mensaje = mensajeParaFlyer(sucursal.mensaje_flyer);
  const logoUrl = sucursal.logo_url ?? tenant?.logo_url ?? null;

  const flyers: DatosFlyer[] = await Promise.all(
    elegidas.map(async (m) => ({
      restaurante: sucursal.nombre,
      logoUrl,
      mensaje,
      mesa: m.nombre,
      qrDataUrl: await qrParaImprimir(urlCartaMesa(origen, m.qr_token)),
      detalle,
    }))
  );

  return (
    <div>
      <div className="flyer-controles">
        <PageHeader
          title="Flyers del QR"
          subtitle={`${sucursal.nombre}: ${mesaParam ? "flyer de la mesa" : "un flyer por mesa"}, listo para imprimir.`}
        />
      </div>
      <FlyersImprimibles flyers={flyers} volverA={`/admin/mesas?sucursal=${sucursal.id}`} />
    </div>
  );
}
