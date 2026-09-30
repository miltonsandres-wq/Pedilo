import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fechaLocalHN, formatearFechaHora, primerDiaDelMes } from "@/lib/fiscal/formato";
import { libroACsv } from "@/lib/fiscal/libro";
import { consultarLibro } from "@/lib/fiscal/libroServidor";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Libro de ventas del periodo en CSV (UTF-8 con BOM: Excel abre bien los acentos). */
export async function GET(request: Request) {
  const sesion = await requireAdmin();
  const supabase = await createClient();
  const url = new URL(request.url);

  const hoy = fechaLocalHN(new Date());
  const desdeParam = url.searchParams.get("desde") ?? "";
  const hastaParam = url.searchParams.get("hasta") ?? "";
  const desde = FECHA.test(desdeParam) ? desdeParam : primerDiaDelMes(hoy);
  const hasta = FECHA.test(hastaParam) ? hastaParam : hoy;

  const { libro } = await consultarLibro(supabase, {
    tenantId: sesion.tenant_id,
    desde,
    hasta,
    sucursalId: url.searchParams.get("sucursal") || null,
  });

  return new Response(libroACsv(libro, (iso) => formatearFechaHora(new Date(iso))), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="libro-ventas-${desde}_${hasta}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
