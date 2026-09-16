import { requireSucursal } from "@/lib/auth/session";
import { DetalleMesa } from "@/components/pos/DetalleMesa";
import type { RolUsuario } from "@/lib/types/helpers";

export default async function MesaPage({ params }: { params: Promise<{ mesaId: string }> }) {
  const sesion = await requireSucursal();
  const { mesaId } = await params;
  return (
    <DetalleMesa
      mesaId={mesaId}
      sucursalId={sesion.sucursal_id}
      usuarioId={sesion.id}
      rol={sesion.rol as RolUsuario}
    />
  );
}
