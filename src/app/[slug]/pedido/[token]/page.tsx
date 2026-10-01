import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SeguimientoPedido } from "@/components/delivery/SeguimientoPedido";
import { cargarSeguimiento } from "@/lib/delivery/seguimientoServidor";
import { slugValido } from "@/lib/delivery/rutas";

export const dynamic = "force-dynamic";

// El enlace con el token es privado: que no lo indexe ningún buscador
export const metadata: Metadata = {
  title: "Seguimiento de tu pedido",
  robots: { index: false, follow: false },
};

export default async function SeguimientoPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  if (!slugValido(slug)) notFound();
  const inicial = await cargarSeguimiento(slug, token);
  if (!inicial) notFound();
  return <SeguimientoPedido slug={slug} token={token} inicial={inicial} />;
}
