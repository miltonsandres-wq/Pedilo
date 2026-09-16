import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/session";
import { BrandMark } from "@/components/BrandMark";
import { CerrarSesionBoton } from "@/components/CerrarSesionBoton";

export default async function PlataformaLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin();

  return (
    <div className="min-h-screen bg-ink-50">
      <header className="sticky top-0 z-10 border-b border-ink-100 bg-ink-950 text-white">
        <div className="flex items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
              <BrandMark className="h-4 w-4 text-white" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Pedilo</p>
              <p className="text-[11px] text-ink-400">Panel de plataforma</p>
            </div>
          </div>
          <CerrarSesionBoton />
        </div>
        <nav className="flex gap-1 px-4 sm:px-6">
          <Link
            href="/plataforma"
            className="rounded-t-lg px-3 py-2 text-sm font-medium text-ink-300 hover:bg-white/5 hover:text-white"
          >
            Clientes
          </Link>
          <Link
            href="/plataforma/ingresos"
            className="rounded-t-lg px-3 py-2 text-sm font-medium text-ink-300 hover:bg-white/5 hover:text-white"
          >
            Ingresos
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl p-4 sm:p-8">{children}</main>
    </div>
  );
}
