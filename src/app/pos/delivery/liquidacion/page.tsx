import { redirect } from "next/navigation";
import { requireSucursal } from "@/lib/auth/session";
import { LiquidacionPanel } from "@/components/pos/delivery/LiquidacionPanel";

export default async function LiquidacionPage() {
  const sesion = await requireSucursal();
  // Es plata: solo quien cobra en caja
  if (sesion.rol !== "cajero") redirect("/pos/delivery");
  return <LiquidacionPanel sucursalId={sesion.sucursal_id} />;
}
