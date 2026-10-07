import { requireDeliverySucursal } from "@/lib/delivery/habilitado";
import { TableroDelivery } from "@/components/pos/delivery/TableroDelivery";

export default async function PosDeliveryPage() {
  const sesion = await requireDeliverySucursal();
  return (
    <TableroDelivery
      sucursalId={sesion.sucursal_id}
      usuarioId={sesion.id}
      puedeDespachar={sesion.rol === "cajero"}
    />
  );
}
