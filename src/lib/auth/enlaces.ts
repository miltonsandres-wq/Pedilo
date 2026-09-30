export type RolPersonal = "cajero" | "mesero";

/** Ruta del login pensada para un cajero o mesero (opcionalmente con su correo ya escrito). */
export function urlLoginPersonal(rol: RolPersonal, email?: string): string {
  const params = new URLSearchParams({ rol });
  if (email) params.set("email", email);
  return `/login?${params.toString()}`;
}

/** Interpreta ?rol= del login: solo acepta cajero o mesero. */
export function rolDeLogin(valor: string | null | undefined): RolPersonal | null {
  return valor === "cajero" || valor === "mesero" ? valor : null;
}
