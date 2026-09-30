/** Mensaje entendible para un error al crear el usuario de acceso (Supabase Auth). */
export function mensajeErrorUsuario(mensaje: string | undefined, codigo?: string): string {
  const m = (mensaje ?? "").toLowerCase();
  if (codigo === "email_exists" || m.includes("already") || m.includes("registered") || m.includes("exists")) {
    return "Ese correo ya tiene una cuenta en Pedilo. Usa otro correo para esta persona.";
  }
  if (m.includes("valid email") || (m.includes("invalid") && m.includes("email"))) return "El correo no es válido.";
  if (m.includes("password")) return "La contraseña no es válida. Usa al menos 6 caracteres.";
  return "No se pudo crear el usuario. Intenta de nuevo.";
}
