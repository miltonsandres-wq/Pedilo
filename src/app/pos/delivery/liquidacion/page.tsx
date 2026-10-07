import { redirect } from "next/navigation";
import { requireDeliverySucursal } from "@/lib/delivery/habilitado";
import { LiquidacionPanel } from "@/components/pos/delivery/LiquidacionPanel";

export default async function LiquidacionPage() {
  const sesion = await requireDeliverySucursal();
  // Es plata: solo quien cobra en caja
  if (sesion.rol !== "cajero") redirect("/pos/delivery");
  return <LiquidacionPanel sucursalId={sesion.sucursal_id} />;
}
