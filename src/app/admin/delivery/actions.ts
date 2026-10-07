"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireDeliveryAdmin } from "@/lib/delivery/habilitado";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { horarioDesdeFormulario } from "@/lib/delivery/horario";
import { slugValido } from "@/lib/delivery/rutas";

const RUTA = "/admin/delivery";
const volver = (sucursalId: string, tipo: "ok" | "error", mensaje: string): never =>
  redirect(`${RUTA}?sucursal=${sucursalId}&${tipo}=${encodeURIComponent(mensaje)}`);

/** La sucursal tiene que ser de ESTE negocio (la RLS ya lo impide, pero así el error es claro). */
async function sucursalPropia(sucursalId: string, tenantId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("sucursales").select("id").eq("id", sucursalId).eq("tenant_id", tenantId).maybeSingle();
  if (!data) redirect(RUTA);
  return supabase;
}

const texto = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const numero = (f: FormData, k: string, defecto: number) => {
  const n = Number(texto(f, k).replace(",", "."));
  return Number.isFinite(n) ? n : defecto;
};

export async function guardarConfigDelivery(formData: FormData) {
  const sesion = await requireDeliveryAdmin();
  const sucursalId = texto(formData, "sucursal_id");
  const supabase = await sucursalPropia(sucursalId, sesion.tenant_id);

  const slug = texto(formData, "slug").toLowerCase();
  if (slug && !slugValido(slug)) {
    volver(sucursalId, "error", "El código del restaurante usa solo letras minúsculas, números y guiones (3 a 40), y no puede ser una palabra reservada como «admin» o «pos».");
  }
  const metodos = formData.getAll("metodos").map(String).filter((m) => ["efectivo", "tarjeta_contra_entrega", "transferencia"].includes(m));
  if (metodos.length === 0) volver(sucursalId, "error", "Elige al menos un método de pago.");

  const horario = horarioDesdeFormulario((c) => formData.get(c)?.toString());
  if (!horario.ok) volver(sucursalId, "error", horario.error);

  const activo = formData.get("activo") === "on";
  if (activo) {
    if (!slug) volver(sucursalId, "error", "Para activar el delivery escribe el código del restaurante (es la dirección de tu menú).");
    const { count } = await supabase.from("delivery_zonas").select("*", { count: "exact", head: true }).eq("sucursal_id", sucursalId).eq("activa", true);
    if (!count) volver(sucursalId, "error", "Para activar el delivery agrega al menos una zona de entrega.");
    if (metodos.includes("transferencia") && !texto(formData, "cuenta_transferencia")) {
      volver(sucursalId, "error", "Escribe los datos de la cuenta para recibir transferencias, o quita ese método.");
    }
  }

  const tasa = texto(formData, "tasa_isv_envio");
  const fila = {
    sucursal_id: sucursalId,
    activo,
    horario: (horario as { horario: Record<string, unknown> }).horario as never,
    monto_minimo: Math.max(0, numero(formData, "monto_minimo", 0)),
    tiempo_estimado_min: Math.max(1, Math.round(numero(formData, "tiempo_estimado_min", 45))),
    metodos_pago: metodos,
    cuenta_transferencia: texto(formData, "cuenta_transferencia") || null,
    slug: slug || null,
    mensaje_bienvenida: texto(formData, "mensaje_bienvenida") || null,
    tasa_isv_envio: ["exento", "15", "18"].includes(tasa) ? tasa : "15",
    radio_llegada_m: Math.min(1000, Math.max(20, Math.round(numero(formData, "radio_llegada_m", 100)))),
    velocidad_moto_kmh: Math.max(5, numero(formData, "velocidad_moto_kmh", 25)),
    retencion_rastro_dias: Math.max(1, Math.round(numero(formData, "retencion_rastro_dias", 90))),
    tenant_id: sesion.tenant_id,
  };

  const { error } = await supabase.from("delivery_config").upsert(fila, { onConflict: "sucursal_id" });
  if (error) {
    volver(sucursalId, "error", /duplicate|unique/i.test(error.message) ? "Ese código de restaurante ya lo usa otro negocio. Elige otro." : "No se pudo guardar la configuración.");
  }
  revalidatePath(RUTA);
  volver(sucursalId, "ok", "Configuración guardada");
}

export async function guardarZona(formData: FormData) {
  const sesion = await requireDeliveryAdmin();
  const sucursalId = texto(formData, "sucursal_id");
  const supabase = await sucursalPropia(sucursalId, sesion.tenant_id);
  const id = texto(formData, "id");
  const nombre = texto(formData, "nombre");
  const tarifa = numero(formData, "tarifa", NaN);
  if (!nombre) volver(sucursalId, "error", "Escribe el nombre de la zona (ej. Col. Trejo).");
  if (!Number.isFinite(tarifa) || tarifa < 0) volver(sucursalId, "error", "La tarifa de envío debe ser un monto en lempiras (puede ser 0).");

  const cambios = { nombre, tarifa,
    // una casilla sin marcar no se envía: `activa_form` avisa que el formulario sí la traía
    activa: formData.get("activa_form") ? formData.get("activa") === "on" : true };
  const { error } = id
    ? await supabase.from("delivery_zonas").update(cambios).eq("id", id).eq("sucursal_id", sucursalId)
    : await supabase.from("delivery_zonas").insert({ ...cambios, sucursal_id: sucursalId, tenant_id: sesion.tenant_id });
  if (error) volver(sucursalId, "error", /duplicate|unique/i.test(error.message) ? "Ya tienes una zona con ese nombre." : "No se pudo guardar la zona.");
  revalidatePath(RUTA);
  volver(sucursalId, "ok", id ? "Zona actualizada" : "Zona agregada");
}

export async function eliminarZona(formData: FormData) {
  const sesion = await requireDeliveryAdmin();
  const sucursalId = texto(formData, "sucursal_id");
  const supabase = await sucursalPropia(sucursalId, sesion.tenant_id);
  // Los pedidos viejos conservan el nombre de la zona (snapshot); la FK queda en null
  const { error } = await supabase.from("delivery_zonas").delete().eq("id", texto(formData, "id")).eq("sucursal_id", sucursalId);
  if (error) volver(sucursalId, "error", "No se pudo eliminar la zona.");
  revalidatePath(RUTA);
  volver(sucursalId, "ok", "Zona eliminada");
}

export async function guardarRepartidor(formData: FormData) {
  const sesion = await requireDeliveryAdmin();
  const sucursalId = texto(formData, "sucursal_id");
  const supabase = await sucursalPropia(sucursalId, sesion.tenant_id);
  const id = texto(formData, "id");
  const nombre = texto(formData, "nombre");
  const pin = texto(formData, "pin");
  const tipoPago = texto(formData, "tipo_pago") === "fijo" ? "fijo" : "por_entrega";

  if (!nombre) volver(sucursalId, "error", "Escribe el nombre del repartidor.");
  if (!id && !pin) volver(sucursalId, "error", "Asígnale un PIN de 4 a 6 dígitos para que pueda entrar.");
  if (pin && !/^\d{4,6}$/.test(pin)) volver(sucursalId, "error", "El PIN debe tener de 4 a 6 dígitos.");

  const cambios = {
    nombre,
    telefono: texto(formData, "telefono") || null,
    tipo_pago: tipoPago,
    monto_por_entrega: tipoPago === "por_entrega" ? Math.max(0, numero(formData, "monto_por_entrega", 0)) : 0,
    activo: formData.get("activo_form") ? formData.get("activo") === "on" : true,
  };

  let repartidorId = id;
  if (id) {
    const { error } = await supabase.from("repartidores").update(cambios).eq("id", id).eq("sucursal_id", sucursalId);
    if (error) volver(sucursalId, "error", "No se pudo guardar al repartidor.");
  } else {
    const { data, error } = await supabase.from("repartidores").insert({ ...cambios, sucursal_id: sucursalId, tenant_id: sesion.tenant_id }).select("id").single();
    if (error || !data) volver(sucursalId, "error", "No se pudo crear al repartidor.");
    repartidorId = data!.id;
  }

  // El PIN se guarda SOLO como hash bcrypt, en una tabla que ni el personal puede leer
  if (pin) {
    const admin = createAdminClient();
    const { data: hash, error: errHash } = await admin.rpc("repartidor_hash_pin", { p_pin: pin });
    if (errHash || !hash) volver(sucursalId, "error", "No se pudo guardar el PIN.");
    const { error: errCred } = await admin
      .from("repartidor_credenciales")
      .upsert({ repartidor_id: repartidorId, pin_hash: hash as string, intentos_fallidos: 0, bloqueado_hasta: null }, { onConflict: "repartidor_id" });
    if (errCred) volver(sucursalId, "error", "No se pudo guardar el PIN.");
  }

  revalidatePath(RUTA);
  volver(sucursalId, "ok", id ? "Repartidor actualizado" : "Repartidor creado");
}
