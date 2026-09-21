import Link from "next/link";
import { requireOperativo } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { BrandMark } from "@/components/BrandMark";
import { CerrarSesionBoton } from "@/components/CerrarSesionBoton";
import { ProveedorSync } from "@/components/ProveedorSync";
import { PantallaCocina } from "@/components/cocina/PantallaCocina";
import { cn } from "@/lib/ui";

/**
 * Pantalla de cocina (KDS): pensada para dejarla corriendo en una tablet/
 * monitor en la cocina, no para navegar. Fuera de /pos a propósito — el
 * layout de /pos exige una sucursal fija (requireSucursal), y el admin no
 * tiene una: acá cualquier rol operativo entra (ver requireOperativo), y el
 * admin elige la sucursal con el selector de abajo si tiene varias.
 */
export default async function CocinaPage({
  searchParams,
}: {
  searchParams: Promise<{ sucursal?: string }>;
}) {
  const sesion = await requireOperativo();
  const supabase = await createClient();
  const { sucursal: sucursalParam } = await searchParams;

  let sucursales: { id: string; nombre: string }[] | null = null;
  let sucursalId = sesion.sucursal_id ?? sucursalParam ?? null;

  if (sesion.rol === "admin") {
    const { data } = await supabase
      .from("sucursales")
      .select("id, nombre")
      .eq("tenant_id", sesion.tenant_id)
      .eq("activo", true)
      .order("nombre");
    sucursales = data;
    if (!sucursalId) sucursalId = data?.[0]?.id ?? null;
  }

  if (!sucursalId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950 text-ink-400">
        Todavía no hay sucursales activas.
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-ink-950">
      <ProveedorSync sucursalId={sucursalId} tenantId={sesion.tenant_id} />

      <header className="flex flex-wrap items-center gap-3 border-b border-ink-800 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
            <BrandMark className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-white">Cocina</span>
        </div>

        {sucursales && sucursales.length > 1 ? (
          <div className="flex flex-wrap gap-1.5">
            {sucursales.map((s) => (
              <Link
                key={s.id}
                href={`/cocina?sucursal=${s.id}`}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition",
                  s.id === sucursalId
                    ? "bg-brand-600 text-white"
                    : "bg-ink-800 text-ink-300 hover:bg-ink-700"
                )}
              >
                {s.nombre}
              </Link>
            ))}
          </div>
        ) : (
          sucursales?.[0] && <span className="text-xs text-ink-400">{sucursales[0].nombre}</span>
        )}

        <div className="ml-auto flex items-center gap-3">
          <Link href="/pos" className="text-xs text-ink-400 hover:text-white">
            Ir al POS
          </Link>
          <CerrarSesionBoton />
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <PantallaCocina sucursalId={sucursalId} />
      </main>
    </div>
  );
}
