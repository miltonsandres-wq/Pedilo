import { requireSucursal } from "@/lib/auth/session";
import { MapaFlota } from "@/components/pos/delivery/MapaFlota";

export default async function FlotaPage() {
  const sesion = await requireSucursal();
  return <MapaFlota sucursalId={sesion.sucursal_id} />;
}
