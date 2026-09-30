/**
 * A dónde va cada rol al entrar: el dueño al panel, cocina a su pantalla (es lo
 * ÚNICO que puede usar) y cajero/mesero al POS.
 */
export function rutaInicialPorRol(rol: string): "/admin" | "/cocina" | "/pos" {
  if (rol === "admin") return "/admin";
  if (rol === "cocina") return "/cocina";
  return "/pos";
}
