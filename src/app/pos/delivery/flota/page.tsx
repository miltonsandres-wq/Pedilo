import { requireDeliverySucursal } from "@/lib/delivery/habilitado";
import { MapaFlota } from "@/components/pos/delivery/MapaFlota";

export default async function FlotaPage() {
  const sesion = await requireDeliverySucursal();
  return <MapaFlota sucursalId={sesion.sucursal_id} />;
}
