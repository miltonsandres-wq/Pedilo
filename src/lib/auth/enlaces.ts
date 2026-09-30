export type RolPersonal = "cajero" | "mesero" | "cocina";

/** Ruta del login pensada para un cajero o mesero (opcionalmente con su correo ya escrito). */
export function urlLoginPersonal(rol: RolPersonal, email?: string): string {
  const params = new URLSearchParams({ rol });
  if (email) params.set("email", email);
  return `/login?${params.toString()}`;
}

/** Interpreta ?rol= del login: solo acepta cajero, mesero o cocina. */
export function rolDeLogin(valor: string | null | undefined): RolPersonal | null {
  return valor === "cajero" || valor === "mesero" || valor === "cocina" ? valor : null;
}
