import Link from "next/link";
import { requireSucursal } from "@/lib/auth/session";
import { ProveedorSync } from "@/components/ProveedorSync";
import { SyncIndicator } from "@/components/SyncIndicator";
import { CerrarSesionBoton } from "@/components/CerrarSesionBoton";
import { BrandMark } from "@/components/BrandMark";

export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const sesion = await requireSucursal();

  return (
    <div className="min-h-screen bg-ink-50">
      <ProveedorSync sucursalId={sesion.sucursal_id} tenantId={sesion.tenant_id} />
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-ink-100 bg-white/90 px-4 py-3 backdrop-blur">
        <Link href="/pos" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600">
            <BrandMark className="h-5 w-5 text-white" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-ink-900">{sesion.nombre}</p>
            <p className="text-[11px] capitalize text-ink-400">{sesion.rol}</p>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          <SyncIndicator />
          <CerrarSesionBoton />
        </div>
      </header>
      <main className="p-4">{children}</main>
    </div>
  );
}
