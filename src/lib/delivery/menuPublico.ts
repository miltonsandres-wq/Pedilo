import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { diaHonduras, textoHorario } from "./horario";
import type { MetodoPago } from "./validaciones";

/**
 * Lee, con la service role, SOLO lo que un cliente del restaurante puede ver
 * (menú, zonas con su tarifa, si está abierto). Se busca por `slug` público;
 * nunca se expone nada de otras sucursales ni datos internos (cuenta de
 * transferencia solo si ese método está habilitado).
 */

export interface ProductoPublico {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  foto_url: string | null;
  categoria_id: string | null;
}

export interface MenuDelivery {
  slug: string;
  sucursalId: string;
  nombre: string;
  logoUrl: string | null;
  telefono: string | null;
  mensajeBienvenida: string | null;
  abierto: boolean;
  /** Por qué está cerrado, listo para mostrar (null si está abierto). */
  motivoCierre: string | null;
  horarioHoy: string | null;
  tiempoEstimadoMin: number;
  montoMinimo: number;
  metodosPago: MetodoPago[];
  cuentaTransferencia: string | null;
  categorias: { id: string; nombre: string }[];
  productos: ProductoPublico[];
  zonas: { id: string; nombre: string; tarifa: number }[];
}

export async function cargarMenuDelivery(slug: string): Promise<MenuDelivery | null> {
  const admin = createAdminClient();

  const { data: config } = await admin.from("delivery_config").select("*").eq("slug", slug).maybeSingle();
  if (!config) return null;

  const [{ data: sucursal }, { data: categorias }, { data: prodSuc }, { data: zonas }, { data: abierto }] =
    await Promise.all([
      admin.from("sucursales").select("nombre, telefono, logo_url, activo").eq("id", config.sucursal_id).single(),
      admin.from("categorias").select("id, nombre, orden").eq("tenant_id", config.tenant_id).order("orden"),
      admin
        .from("producto_sucursales")
        .select("productos(id, nombre, descripcion, precio, foto_url, categoria_id, disponible, activo)")
        .eq("sucursal_id", config.sucursal_id),
      admin
        .from("delivery_zonas")
        .select("id, nombre, tarifa")
        .eq("sucursal_id", config.sucursal_id)
        .eq("activa", true)
        .order("nombre"),
      admin.rpc("delivery_abierto", { p_sucursal: config.sucursal_id }),
    ]);

  if (!sucursal || !sucursal.activo) return null;

  const productos = (prodSuc ?? [])
    .map((r) => r.productos)
    .filter((p): p is NonNullable<typeof p> => !!p && p.activo && p.disponible)
    .map((p) => ({
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion,
      precio: Number(p.precio),
      foto_url: p.foto_url,
      categoria_id: p.categoria_id,
    }));

  const estaAbierto = abierto === true;
  const horarioHoy = textoHorario(config.horario, diaHonduras());
  let motivoCierre: string | null = null;
  if (!estaAbierto) {
    if (!config.activo) motivoCierre = "Por ahora este restaurante no recibe pedidos a domicilio.";
    else if (config.pausado) motivoCierre = "Pausamos los pedidos un momento por alta demanda. Vuelve a intentar en unos minutos.";
    else motivoCierre = horarioHoy
      ? `Estamos fuera de horario. Hoy recibimos pedidos de ${horarioHoy}.`
      : "Hoy no recibimos pedidos a domicilio.";
  }

  const metodos = config.metodos_pago as MetodoPago[];
  return {
    slug,
    sucursalId: config.sucursal_id,
    nombre: sucursal.nombre,
    logoUrl: sucursal.logo_url,
    telefono: sucursal.telefono,
    mensajeBienvenida: config.mensaje_bienvenida,
    abierto: estaAbierto,
    motivoCierre,
    horarioHoy,
    tiempoEstimadoMin: config.tiempo_estimado_min,
    montoMinimo: Number(config.monto_minimo),
    metodosPago: metodos,
    cuentaTransferencia: metodos.includes("transferencia") ? config.cuenta_transferencia : null,
    categorias: (categorias ?? []).map((c) => ({ id: c.id, nombre: c.nombre })),
    productos,
    zonas: (zonas ?? []).map((z) => ({ id: z.id, nombre: z.nombre, tarifa: Number(z.tarifa) })),
  };
}
