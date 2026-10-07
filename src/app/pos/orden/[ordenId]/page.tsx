import { requireSucursal } from "@/lib/auth/session";
import { DetalleMesa } from "@/components/pos/DetalleMesa";
import type { RolUsuario } from "@/lib/types/helpers";

/** Pedido SIN mesa (para llevar, plataforma): se abre por el id de la orden. */
export default async function OrdenPage({ params }: { params: Promise<{ ordenId: string }> }) {
  const sesion = await requireSucursal();
  const { ordenId } = await params;
  return (
    <DetalleMesa
      ordenId={ordenId}
      sucursalId={sesion.sucursal_id}
      usuarioId={sesion.id}
      rol={sesion.rol as RolUsuario}
      puedeTicketSinFactura={sesion.puede_ticket_sin_factura === true}
    />
  );
}
