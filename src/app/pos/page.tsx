import { requireSucursal } from "@/lib/auth/session";
import { MapaMesas } from "@/components/pos/MapaMesas";
import type { RolUsuario } from "@/lib/types/helpers";

export default async function PosMapaPage() {
  const sesion = await requireSucursal();
  return (
    <MapaMesas
      sucursalId={sesion.sucursal_id}
      tenantId={sesion.tenant_id}
      usuarioId={sesion.id}
      rol={sesion.rol as RolUsuario}
    />
  );
}
