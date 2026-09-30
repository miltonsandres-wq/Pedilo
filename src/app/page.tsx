import { redirect } from "next/navigation";
import { getSesion, tieneCuentaSinCompletar } from "@/lib/auth/session";
import { rutaInicialPorRol } from "@/lib/auth/rutas";
import { LandingPage } from "@/components/marketing/LandingPage";

export default async function Home() {
  const sesion = await getSesion();
  if (sesion) redirect(rutaInicialPorRol(sesion.rol));
  if (await tieneCuentaSinCompletar()) redirect("/registro/completar");
  return <LandingPage />;
}
