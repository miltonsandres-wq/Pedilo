import { requireSucursal } from "@/lib/auth/session";
import { ListaDocumentos } from "@/components/pos/ListaDocumentos";
import type { RolUsuario } from "@/lib/types/helpers";

export default async function DocumentosPage() {
  const sesion = await requireSucursal();
  return (
    <ListaDocumentos
      sucursalId={sesion.sucursal_id}
      usuarioId={sesion.id}
      rol={sesion.rol as RolUsuario}
    />
  );
}
