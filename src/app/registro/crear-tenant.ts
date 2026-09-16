import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type SucursalRegistro = {
  nombre: string;
  telefono: string;
  direccion: string;
};

/**
 * Crea el tenant + sus sucursales (+ efectivo habilitado en cada una) con la
 * service_role key — usado tanto por el registro con correo/contraseña como
 * por el de Google (ver ./completar/actions.ts), que solo difieren en cómo
 * se crea el usuario de Auth. Si falla la creación de sucursales, revierte
 * el tenant para no dejarlo a medias.
 */
export async function crearTenantConSucursales(
  sucursalesInput: SucursalRegistro[]
): Promise<{ error: string } | { tenantId: string }> {
  const sucursales = sucursalesInput
    .map((s) => ({ nombre: s.nombre.trim(), telefono: s.telefono.trim(), direccion: s.direccion.trim() }))
    .filter((s) => s.nombre);

  if (sucursales.length === 0) {
    return { error: "Agrega al menos una sucursal con nombre." };
  }

  const admin = createAdminClient();

  // Plan según cuántas sucursales pidió desde el registro: 1 o 2 sucursales
  // son los planes de catálogo (L900/L1200); 3+ queda "personalizado" — sin
  // precio fijo, vos se lo asignás a mano en /plataforma. Todo tenant nuevo
  // arranca en prueba 15 días, sin importar el plan.
  const plan = sucursales.length === 1 ? "plan_1" : sucursales.length === 2 ? "plan_2" : "personalizado";
  const precioMensual = sucursales.length === 1 ? 900 : sucursales.length === 2 ? 1200 : null;
  const pruebaVenceEl = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();

  const { data: tenant, error: errTenant } = await admin
    .from("tenants")
    .insert({
      nombre: sucursales[0].nombre,
      plan,
      max_sucursales: sucursales.length,
      precio_mensual: precioMensual,
      suscripcion_estado: "prueba",
      prueba_vence_el: pruebaVenceEl,
    })
    .select()
    .single();
  if (errTenant || !tenant) {
    return { error: "No se pudo crear la cuenta. Intenta de nuevo." };
  }

  const { data: sucursalesCreadas, error: errSucursales } = await admin
    .from("sucursales")
    .insert(
      sucursales.map((s) => ({
        tenant_id: tenant.id,
        nombre: s.nombre,
        telefono: s.telefono || null,
        direccion: s.direccion || null,
      }))
    )
    .select();
  if (errSucursales || !sucursalesCreadas?.length) {
    await admin.from("tenants").delete().eq("id", tenant.id);
    return { error: "No se pudieron crear las sucursales. Intenta de nuevo." };
  }

  await admin
    .from("formas_pago_sucursal")
    .insert(sucursalesCreadas.map((s) => ({ sucursal_id: s.id, forma_pago: "efectivo", activo: true })));

  return { tenantId: tenant.id };
}
