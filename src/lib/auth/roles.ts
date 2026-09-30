/**
 * Roles del equipo de trabajo y qué puede hacer cada uno. La base de datos
 * (migración 0021) es quien de verdad lo hace cumplir; esto es lo que muestra
 * la interfaz y lo que aceptan las acciones del servidor.
 */
export type RolEquipo = "admin" | "cajero" | "mesero" | "cocina";

export const ROLES_PERSONAL = ["cajero", "mesero", "cocina"] as const;
export const ROLES_ASIGNABLES = ["admin", ...ROLES_PERSONAL] as const;

export const INFO_ROL: Record<RolEquipo, { etiqueta: string; plural: string; descripcion: string; tono: "brand" | "warning" | "neutral" | "success" }> = {
  admin: {
    etiqueta: "Administrador",
    plural: "Administradores",
    descripcion: "Configura todo el negocio y ve todas las sucursales.",
    tono: "brand",
  },
  cajero: {
    etiqueta: "Cajero",
    plural: "Cajeros",
    descripcion: "Abre mesas y cobra. Factura si el negocio usa CAI.",
    tono: "warning",
  },
  mesero: {
    etiqueta: "Mesero",
    plural: "Meseros",
    descripcion: "Toma pedidos y los envía a cocina.",
    tono: "neutral",
  },
  cocina: {
    etiqueta: "Cocina",
    plural: "Cocina",
    descripcion: "Solo ve la pantalla de cocina y marca los pedidos como listos.",
    tono: "success",
  },
};

export function esRolAsignable(valor: string): valor is RolEquipo {
  return (ROLES_ASIGNABLES as readonly string[]).includes(valor);
}

export function esRolDePersonal(valor: string): valor is (typeof ROLES_PERSONAL)[number] {
  return (ROLES_PERSONAL as readonly string[]).includes(valor);
}
