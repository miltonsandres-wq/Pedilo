import { redirect } from "next/navigation";
import { getSesion, tieneCuentaSinCompletar } from "@/lib/auth/session";
import { LandingPage } from "@/components/marketing/LandingPage";

export default async function Home() {
  const sesion = await getSesion();
  if (sesion) redirect(sesion.rol === "admin" ? "/admin" : "/pos");
  if (await tieneCuentaSinCompletar()) redirect("/registro/completar");
  return <LandingPage />;
}
