"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export async function actualizarSuscripcion(tenantId: string, formData: FormData) {
  await requireSuperAdmin();
  const admin = createAdminClient();

  const venceEl = String(formData.get("suscripcion_vence_el") ?? "");
  const precio = String(formData.get("precio_mensual") ?? "");

  await admin
    .from("tenants")
    .update({
      plan: String(formData.get("plan") ?? "plan_1"),
      max_sucursales: Number(formData.get("max_sucursales") ?? 1),
      precio_mensual: precio ? Number(precio) : null,
      suscripcion_estado: String(formData.get("suscripcion_estado") ?? "prueba"),
      suscripcion_vence_el: venceEl ? new Date(venceEl).toISOString() : null,
      notas_admin: String(formData.get("notas_admin") ?? "") || null,
    })
    .eq("id", tenantId);

  revalidatePath("/plataforma");
}

/**
 * Atajo para el caso común: "ya me pagó la mensualidad" — activa, corre el
 * vencimiento un mes y registra el ingreso (por el precio actual del tenant)
 * en pagos_plataforma para que aparezca en /plataforma/ingresos.
 */
export async function marcarPagado(tenantId: string) {
  await requireSuperAdmin();
  const admin = createAdminClient();

  const { data: tenant } = await admin
    .from("tenants")
    .select("suscripcion_vence_el, precio_mensual")
    .eq("id", tenantId)
    .single();

  const base =
    tenant?.suscripcion_vence_el && new Date(tenant.suscripcion_vence_el) > new Date()
      ? new Date(tenant.suscripcion_vence_el)
      : new Date();
  base.setMonth(base.getMonth() + 1);

  await admin
    .from("tenants")
    .update({ suscripcion_estado: "activa", suscripcion_vence_el: base.toISOString() })
    .eq("id", tenantId);

  if (tenant?.precio_mensual != null) {
    await admin.from("pagos_plataforma").insert({
      tenant_id: tenantId,
      monto: tenant.precio_mensual,
      tipo: "mensual",
    });
  }

  revalidatePath("/plataforma");
  revalidatePath("/plataforma/ingresos");
}

/**
 * Registra un pago a mano: para compras únicas (sin mensualidad — deja al
 * tenant "activa" sin fecha de vencimiento, o sea acceso indefinido) o
 * cualquier cobro fuera de lo normal (ajustes, upgrades a mitad de mes...).
 */
export async function registrarPago(tenantId: string, formData: FormData) {
  await requireSuperAdmin();
  const admin = createAdminClient();

  const monto = Number(formData.get("monto") ?? 0);
  const tipo = String(formData.get("tipo") ?? "otro");
  const fecha = String(formData.get("fecha_pago") ?? "");
  const notas = String(formData.get("notas") ?? "") || null;

  if (!monto || monto <= 0) return;

  await admin.from("pagos_plataforma").insert({
    tenant_id: tenantId,
    monto,
    tipo,
    fecha_pago: fecha || undefined,
    notas,
  });

  if (tipo === "compra_unica") {
    await admin
      .from("tenants")
      .update({ suscripcion_estado: "activa", suscripcion_vence_el: null })
      .eq("id", tenantId);
  }

  revalidatePath("/plataforma");
  revalidatePath("/plataforma/ingresos");
}

export async function crearFormaPago(formData: FormData) {
  await requireSuperAdmin();
  const admin = createAdminClient();
  await admin.from("formas_pago_plataforma").insert({
    descripcion: String(formData.get("descripcion") ?? ""),
    orden: Number(formData.get("orden") ?? 0),
  });
  revalidatePath("/plataforma");
}

export async function actualizarFormaPago(id: string, formData: FormData) {
  await requireSuperAdmin();
  const admin = createAdminClient();
  await admin
    .from("formas_pago_plataforma")
    .update({
      descripcion: String(formData.get("descripcion") ?? ""),
      activo: formData.get("activo") === "on",
    })
    .eq("id", id);
  revalidatePath("/plataforma");
}

export async function eliminarFormaPago(id: string) {
  await requireSuperAdmin();
  const admin = createAdminClient();
  await admin.from("formas_pago_plataforma").delete().eq("id", id);
  revalidatePath("/plataforma");
}
