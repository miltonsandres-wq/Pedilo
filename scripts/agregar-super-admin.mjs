// Da de alta a un usuario ya existente (por correo) como super-admin de la
// plataforma: puede entrar a /plataforma a ver y administrar TODOS los
// tenants (suscripción, plan, formas de pago). Requiere que el usuario ya
// tenga cuenta (creada por /registro o por seed-tenant.mjs).
//
// Uso:
//   node scripts/agregar-super-admin.mjs correo@ejemplo.com
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function cargarEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const linea of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
cargarEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2]?.trim().toLowerCase();

if (!url || !serviceRoleKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (revisa .env.local).");
  process.exit(1);
}
if (!email) {
  console.error("Uso: node scripts/agregar-super-admin.mjs correo@ejemplo.com");
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

const { data: lista, error: errLista } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (errLista) throw errLista;

const usuario = lista.users.find((u) => u.email?.toLowerCase() === email);
if (!usuario) {
  console.error(`No existe ningún usuario con el correo ${email}. Créalo primero (registro o panel de admin).`);
  process.exit(1);
}

const { error } = await admin.from("plataforma_admins").upsert({ user_id: usuario.id });
if (error) throw error;

console.log(`Listo: ${email} ya puede entrar a /plataforma.`);
