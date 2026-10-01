import { AppRepartidor } from "@/components/repartidor/AppRepartidor";

/**
 * PWA del repartidor. Es pública para el middleware de Supabase Auth: el
 * repartidor no tiene cuenta; entra con restaurante + PIN (ver ./actions.ts).
 * `?r=<código>` deja el restaurante ya elegido (enlace que comparte el admin).
 */
export default async function RepartidorPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const { r } = await searchParams;
  return <AppRepartidor slugInicial={r?.toLowerCase().slice(0, 40)} />;
}
