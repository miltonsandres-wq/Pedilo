import { requireSucursal } from "@/lib/auth/session";
import { MapaMesas } from "@/components/pos/MapaMesas";
import { FacturaEmitidaModal } from "@/components/pos/FacturaEmitidaModal";
import type { RolUsuario } from "@/lib/types/helpers";

export default async function PosMapaPage({
  searchParams,
}: {
  searchParams: Promise<{ factura?: string }>;
}) {
  const sesion = await requireSucursal();
  const { factura } = await searchParams;
  return (
    <>
      <MapaMesas
        sucursalId={sesion.sucursal_id}
        tenantId={sesion.tenant_id}
        usuarioId={sesion.id}
        rol={sesion.rol as RolUsuario}
      />
      {factura && <FacturaEmitidaModal documentoId={factura} />}
    </>
  );
}
