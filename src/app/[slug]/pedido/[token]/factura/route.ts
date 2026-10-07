import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cargarSeguimiento } from "@/lib/delivery/seguimientoServidor";
import { construirFactura, type DocumentoImprimible } from "@/lib/printing/documentoTexto";
import { instruccionesAPdf } from "@/lib/printing/ticketPdf";
import { logoFondoParaPdf } from "@/lib/printing/logoFondoServidor";

/**
 * Factura del pedido en PDF, solo con el token de seguimiento. Es la MISMA que
 * se imprimió (mismo armado de ticket), nunca una versión recalculada: se lee
 * el documento fiscal ya emitido y sincronizado.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const seguimiento = await cargarSeguimiento(slug, token);
  if (!seguimiento?.factura) return new NextResponse("Factura no disponible", { status: 404 });

  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("documentos_fiscales")
    .select("*")
    .eq("id", seguimiento.factura.id)
    .eq("orden_id", seguimiento.orden_id)
    .maybeSingle();
  if (!doc) return new NextResponse("Factura no disponible", { status: 404 });

  // Logo del negocio de marca de agua: el de la sucursal o, si no, el del negocio
  const [{ data: sucursal }, { data: tenant }] = await Promise.all([
    admin.from("sucursales").select("logo_url").eq("id", doc.sucursal_id).maybeSingle(),
    admin.from("tenants").select("logo_url").eq("id", doc.tenant_id).maybeSingle(),
  ]);
  const logoFondoPng = await logoFondoParaPdf(sucursal?.logo_url ?? tenant?.logo_url);

  const pdf = await instruccionesAPdf(construirFactura(doc as unknown as DocumentoImprimible, { copia: "cliente" }), { logoFondoPng });
  const nombre = `factura-${doc.numero_completo}.pdf`.replace(/[^A-Za-z0-9._-]/g, "_");
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
