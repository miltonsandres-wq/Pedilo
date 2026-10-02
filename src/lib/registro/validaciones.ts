/**
 * Validaciones del registro del negocio. Son funciones puras que usan tanto el
 * formulario (para avisar campo por campo antes de pasar al siguiente paso)
 * como el servidor (que nunca confía en lo que mandó el navegador).
 */

export const MIN_PASSWORD = 8;
/** bcrypt (lo que usa Supabase Auth) solo considera los primeros 72 bytes. */
export const MAX_PASSWORD = 72;

export type Errores<T extends string> = Partial<Record<T, string>>;

export interface SucursalEntrada {
  nombre: string;
  telefono: string;
  direccion: string;
}

export function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase();
}

export function validarNombre(nombre: string, etiqueta = "tu nombre"): string | undefined {
  const n = nombre.trim();
  if (!n) return `Escribe ${etiqueta}.`;
  if (n.length < 2) return "Es muy corto: escribe al menos 2 letras.";
  if (n.length > 80) return "Es muy largo: máximo 80 caracteres.";
  return undefined;
}

export function validarCorreo(correo: string): string | undefined {
  const c = correo.trim();
  if (!c) return "Escribe tu correo.";
  if (/\s/.test(c)) return "El correo no puede tener espacios.";
  if (!c.includes("@")) return "Falta el «@». Ejemplo: tucorreo@negocio.com";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(c)) return "El correo no parece válido. Ejemplo: tucorreo@negocio.com";
  if (c.length > 254) return "El correo es demasiado largo.";
  return undefined;
}

export function validarPassword(password: string): string | undefined {
  if (!password) return "Escribe una contraseña.";
  if (password.length < MIN_PASSWORD) return `Debe tener al menos ${MIN_PASSWORD} caracteres (llevas ${password.length}).`;
  if (new TextEncoder().encode(password).length > MAX_PASSWORD) return `Es demasiado larga: máximo ${MAX_PASSWORD} caracteres.`;
  return undefined;
}

export function validarConfirmacion(password: string, confirmacion: string): string | undefined {
  if (!confirmacion) return "Repite la contraseña.";
  if (password !== confirmacion) return "Las contraseñas no coinciden.";
  return undefined;
}

export function validarTelefono(telefono: string): string | undefined {
  const t = telefono.trim();
  if (!t) return undefined; // opcional
  if (!/^[\d\s()+\-.]+$/.test(t)) return "Solo números, espacios y guiones.";
  const digitos = t.replace(/\D/g, "").length;
  if (digitos < 7 || digitos > 15) return "El teléfono debe tener entre 7 y 15 dígitos.";
  return undefined;
}

export function validarDireccion(direccion: string): string | undefined {
  if (direccion.trim().length > 200) return "Es muy larga: máximo 200 caracteres.";
  return undefined;
}

// --- Paso 1: la cuenta ---

export type CampoCuenta = "nombreAdmin" | "email" | "password" | "confirmarPassword";

export function validarCuenta(d: {
  nombreAdmin: string;
  email: string;
  password: string;
  confirmarPassword: string;
}): Errores<CampoCuenta> {
  const e: Errores<CampoCuenta> = {};
  const nombre = validarNombre(d.nombreAdmin);
  if (nombre) e.nombreAdmin = nombre;
  const correo = validarCorreo(d.email);
  if (correo) e.email = correo;
  const pass = validarPassword(d.password);
  if (pass) e.password = pass;
  const conf = validarConfirmacion(d.password, d.confirmarPassword);
  if (conf) e.confirmarPassword = conf;
  return e;
}

// --- Paso 2: las sucursales ---

export type CampoSucursal = "nombre" | "telefono" | "direccion";

/** Errores por sucursal (misma posición que la lista) + un error general de la lista. */
export function validarSucursales(sucursales: SucursalEntrada[]): {
  porSucursal: Errores<CampoSucursal>[];
  general?: string;
} {
  const porSucursal = sucursales.map((s) => {
    const e: Errores<CampoSucursal> = {};
    const nombre = validarNombre(s.nombre, "el nombre de la sucursal");
    if (nombre) e.nombre = nombre;
    const tel = validarTelefono(s.telefono);
    if (tel) e.telefono = tel;
    const dir = validarDireccion(s.direccion);
    if (dir) e.direccion = dir;
    return e;
  });

  // Dos sucursales con el mismo nombre se confunden en el panel y en los reportes
  const vistos = new Map<string, number>();
  sucursales.forEach((s, i) => {
    const clave = s.nombre.trim().toLowerCase();
    if (!clave) return;
    if (vistos.has(clave) && !porSucursal[i].nombre) porSucursal[i].nombre = "Ya usaste este nombre en otra sucursal.";
    else vistos.set(clave, i);
  });

  const general = sucursales.length === 0 ? "Agrega al menos una sucursal." : undefined;
  return { porSucursal, general };
}

export const hayErrores = (e: Record<string, unknown>) => Object.keys(e).length > 0;

/**
 * Traduce los errores de Supabase Auth al crear un usuario a un mensaje claro.
 * Mira el código primero y el texto después (varía entre versiones).
 */
export function mensajeErrorAuth(err: { code?: string; message?: string; status?: number } | null | undefined): string {
  const code = err?.code ?? "";
  const msg = (err?.message ?? "").toLowerCase();
  if (code === "email_exists" || code === "user_already_exists" || msg.includes("already been registered") || msg.includes("already registered")) {
    return "Ya existe una cuenta con ese correo. Inicia sesión o usa otro correo.";
  }
  if (code === "weak_password" || msg.includes("password")) {
    return "La contraseña es demasiado débil. Usa al menos 8 caracteres con letras y números.";
  }
  if (code === "email_address_invalid" || code === "validation_failed" || msg.includes("invalid") || msg.includes("email address")) {
    return "Ese correo no es válido. Revísalo e inténtalo de nuevo.";
  }
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || err?.status === 429) {
    return "Demasiados intentos seguidos. Espera un minuto e inténtalo de nuevo.";
  }
  return "No se pudo crear la cuenta. Revisa tu conexión e inténtalo de nuevo.";
}
