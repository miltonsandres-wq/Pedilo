export const NOMBRE_PLAN: Record<string, string> = {
  plan_1: "1 sucursal — L900",
  plan_2: "2 sucursales — L1200",
  compra_unica: "Compra única",
  personalizado: "Personalizado",
};

export function aFechaInput(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

export function estadoTenant(tenant: {
  suscripcion_estado: string;
  prueba_vence_el: string | null;
  suscripcion_vence_el: string | null;
}): { texto: string; tone: "success" | "warning" | "danger"; alDia: boolean } {
  const ahora = new Date();
  if (tenant.suscripcion_estado === "suspendida") {
    return { texto: "Suspendida", tone: "danger", alDia: false };
  }
  if (tenant.suscripcion_estado === "prueba") {
    if (tenant.prueba_vence_el && new Date(tenant.prueba_vence_el) < ahora) {
      return { texto: "Prueba vencida", tone: "danger", alDia: false };
    }
    const dias = tenant.prueba_vence_el
      ? Math.max(0, Math.ceil((new Date(tenant.prueba_vence_el).getTime() - ahora.getTime()) / 86_400_000))
      : null;
    return { texto: dias != null ? `Prueba · ${dias}d` : "Prueba", tone: "warning", alDia: true };
  }
  if (tenant.suscripcion_estado === "activa") {
    if (tenant.suscripcion_vence_el && new Date(tenant.suscripcion_vence_el) < ahora) {
      return { texto: "Vencida", tone: "danger", alDia: false };
    }
    return { texto: "Activa", tone: "success", alDia: true };
  }
  return { texto: tenant.suscripcion_estado, tone: "warning", alDia: false };
}
