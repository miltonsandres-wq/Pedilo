import "server-only";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, requireSucursal } from "@/lib/auth/session";

/**
 * El delivery lo habilita la plataforma (super admin) negocio por negocio:
 * mientras `tenants.delivery_habilitado` sea false no se muestra ni funciona
 * nada de delivery. Se lee con la service role porque el menú público y la app
 * del repartidor no tienen sesión de un usuario del negocio.
 */
export async function tenantTieneDelivery(tenantId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.from("tenants").select("delivery_habilitado").eq("id", tenantId).maybeSingle();
  return data?.delivery_habilitado === true;
}

/** Igual, pero a partir del código público (slug) del restaurante. */
export async function slugTieneDelivery(slug: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: config } = await admin.from("delivery_config").select("tenant_id").eq("slug", slug).maybeSingle();
  return config ? tenantTieneDelivery(config.tenant_id) : false;
}

/** Pantallas y acciones del panel del dueño: 404 si el negocio no tiene delivery habilitado. */
export async function requireDeliveryAdmin() {
  const sesion = await requireAdmin();
  if (!(await tenantTieneDelivery(sesion.tenant_id))) notFound();
  return sesion;
}

/** Pantallas del POS: 404 si el negocio no tiene delivery habilitado. */
export async function requireDeliverySucursal() {
  const sesion = await requireSucursal();
  if (!(await tenantTieneDelivery(sesion.tenant_id))) notFound();
  return sesion;
}
