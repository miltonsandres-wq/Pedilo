import { requireDeliverySucursal } from "@/lib/delivery/habilitado";
import { TableroDelivery } from "@/components/pos/delivery/TableroDelivery";

export default async function PosDeliveryPage({ searchParams }: { searchParams: Promise<{ nuevo?: string }> }) {
  const sesion = await requireDeliverySucursal();
  const { nuevo } = await searchParams;
  return (
    <TableroDelivery
      sucursalId={sesion.sucursal_id}
      usuarioId={sesion.id}
      puedeDespachar={sesion.rol === "cajero"}
      abrirPedidoTelefono={nuevo === "1"}
    />
  );
}
