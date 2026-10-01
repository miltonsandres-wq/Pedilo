import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Retención del rastro GPS: borra los puntos más viejos que la retención de
 * cada sucursal (90 días por omisión) y deja solo el punto de entrega.
 * Llamarlo una vez al día desde un cron:
 *   curl -X POST https://TU-DOMINIO/api/delivery/purgar-rastro -H "Authorization: Bearer $CRON_SECRET"
 */
export async function POST(req: Request) {
  const secreto = process.env.CRON_SECRET;
  const recibido = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(recibido);
  const b = Buffer.from(secreto ?? "");
  if (!secreto || a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { data, error } = await createAdminClient().rpc("purgar_rastro_delivery");
  if (error) return NextResponse.json({ error: "No se pudo purgar" }, { status: 500 });
  return NextResponse.json({ borrados: data });
}

// Algunos cron solo hacen GET
export const GET = POST;
