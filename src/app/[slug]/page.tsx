import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Clock, Phone } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { MenuDeliveryCliente } from "@/components/delivery/MenuDelivery";
import { cargarMenuDelivery } from "@/lib/delivery/menuPublico";
import { slugValido } from "@/lib/delivery/rutas";

// El estado (abierto / pausado) cambia en cualquier momento: nada de caché
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const menu = slugValido(slug) ? await cargarMenuDelivery(slug) : null;
  return {
    title: menu ? `${menu.nombre} · Pedidos a domicilio` : "Pedidos a domicilio",
    description: menu ? `Pide a domicilio en ${menu.nombre}` : undefined,
  };
}

/** Menú público de delivery: lo abre cualquier persona, sin cuenta ni app. */
export default async function MenuDeliveryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!slugValido(slug)) notFound();
  const menu = await cargarMenuDelivery(slug);
  if (!menu) notFound();

  return (
    <div className="min-h-screen bg-ink-50 pb-28">
      <header className="border-b border-ink-100 bg-white px-5 py-6 text-center">
        {menu.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={menu.logoUrl} alt="" className="mx-auto mb-3 h-16 w-16 rounded-xl object-cover" />
        ) : (
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-xl bg-brand-600">
            <BrandMark className="h-8 w-8 text-white" />
          </div>
        )}
        <h1 className="text-lg font-semibold text-ink-900">{menu.nombre}</h1>
        {menu.mensajeBienvenida && <p className="mx-auto mt-1 max-w-sm text-sm text-ink-500">{menu.mensajeBienvenida}</p>}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-ink-500">
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Entrega en ~{menu.tiempoEstimadoMin} min</span>
          {menu.montoMinimo > 0 && <span>Pedido mínimo L {menu.montoMinimo.toFixed(2)}</span>}
          {menu.telefono && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {menu.telefono}</span>}
        </div>
        <span className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-medium ${menu.abierto ? "bg-libre-bg text-libre-text" : "bg-ink-100 text-ink-600"}`}>
          {menu.abierto ? "Abierto — recibiendo pedidos" : "Cerrado por ahora"}
        </span>
      </header>
      <main className="mx-auto max-w-lg px-4 py-6">
        <MenuDeliveryCliente menu={menu} />
      </main>
    </div>
  );
}
