import { requireSucursal } from "@/lib/auth/session";
import { TableroDelivery } from "@/components/pos/delivery/TableroDelivery";

export default async function PosDeliveryPage() {
  const sesion = await requireSucursal();
  return (
    <TableroDelivery
      sucursalId={sesion.sucursal_id}
      usuarioId={sesion.id}
      puedeDespachar={sesion.rol === "cajero"}
    />
  );
}
