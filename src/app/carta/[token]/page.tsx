import { notFound } from "next/navigation";
import { MapPin, Phone } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { CartaCliente } from "@/components/carta/CartaCliente";
import { BrandMark } from "@/components/BrandMark";

/**
 * Menú público al que se llega escaneando el QR de una mesa. Sin sesión: usa
 * el cliente admin (service role) solo para esta lectura muy acotada — busca
 * la mesa por su `qr_token` (no correlativo) y solo expone lo que un cliente
 * del restaurante puede ver (menú, nombre de la mesa/sucursal), nunca datos
 * de otras sucursales ni de otros tenants. El cliente puede armar su pedido
 * y mandarlo — cae directo en la comanda de su mesa (ver ./actions.ts).
 */
export default async function CartaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: mesa } = await admin
    .from("mesas")
    .select("id, nombre, sucursal_id, tenant_id, activa")
    .eq("qr_token", token)
    .eq("activa", true)
    .maybeSingle();

  if (!mesa) notFound();

  const [{ data: sucursal }, { data: categorias }, { data: prodSuc }] = await Promise.all([
    admin.from("sucursales").select("nombre, direccion, telefono, logo_url").eq("id", mesa.sucursal_id).single(),
    admin.from("categorias").select("id, nombre, orden").eq("tenant_id", mesa.tenant_id).order("orden"),
    admin
      .from("producto_sucursales")
      .select("productos(id, nombre, descripcion, precio, foto_url, categoria_id, disponible, activo)")
      .eq("sucursal_id", mesa.sucursal_id),
  ]);

  const productos = (prodSuc ?? [])
    .map((r) => r.productos)
    .filter((p): p is NonNullable<typeof p> => !!p && p.activo && p.disponible)
    .map((p) => ({
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion,
      precio: Number(p.precio),
      foto_url: p.foto_url,
      categoria_id: p.categoria_id,
    }));

  const logoUrl = sucursal?.logo_url;

  return (
    <div className="min-h-screen bg-ink-50 pb-24">
      <header className="border-b border-ink-100 bg-white px-5 py-6 text-center">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="mx-auto mb-3 h-14 w-14 rounded-xl object-cover" />
        ) : (
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-xl bg-brand-600">
            <BrandMark className="h-8 w-8 text-white" />
          </div>
        )}
        <h1 className="text-lg font-semibold text-ink-900">{sucursal?.nombre}</h1>
        <div className="mt-2 flex items-center justify-center gap-3 text-xs text-ink-400">
          {sucursal?.direccion && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {sucursal.direccion}
            </span>
          )}
          {sucursal?.telefono && (
            <span className="flex items-center gap-1">
              <Phone className="h-3 w-3" /> {sucursal.telefono}
            </span>
          )}
        </div>
        <span className="mt-4 inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
          {mesa.nombre}
        </span>
      </header>

      <main className="mx-auto max-w-lg px-4 py-6">
        <CartaCliente token={token} categorias={categorias ?? []} productos={productos} />
      </main>
    </div>
  );
}
