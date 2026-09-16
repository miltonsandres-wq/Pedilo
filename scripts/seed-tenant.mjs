// Bootstrap del primer tenant: crea el negocio, sus sucursales y el primer
// usuario admin. Es la única vez que se toca la base "a mano" — de ahí en
// adelante todo (sucursales, menú, mesas, usuarios) se administra desde el
// panel de admin de la app.
//
// Uso (variables de entorno, ver .env.local que ya tiene URL + service role):
//   TENANT_NOMBRE="Fondita y Taquería" \
//   ADMIN_EMAIL="dueno@ejemplo.com" ADMIN_NOMBRE="Doña María" ADMIN_PASSWORD="cambia-esto" \
//   SUCURSAL_1="Fondita — barrio" SUCURSAL_2="Taquería San Pedro Sula" \
//   node scripts/seed-tenant.mjs
//
// ADMIN_PASSWORD es opcional: si se omite, se genera una temporal y se
// imprime al final. SUCURSAL_2, SUCURSAL_3... también son opcionales (con
// solo SUCURSAL_1 se crea un único local).
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
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

if (!url || !serviceRoleKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (revisa .env.local).");
  process.exit(1);
}

const tenantNombre = process.env.TENANT_NOMBRE ?? "Mi Restaurante";
const adminEmail = process.env.ADMIN_EMAIL;
const adminNombre = process.env.ADMIN_NOMBRE ?? "Administrador";
// Si no se pasa contraseña (ej. una corrida de prueba), se genera una
// temporal y se imprime al final — nunca queda un valor por defecto fijo.
const adminPassword = process.env.ADMIN_PASSWORD ?? randomBytes(9).toString("base64url");
// Al menos una sucursal (SUCURSAL_1); SUCURSAL_2, SUCURSAL_3... son opcionales.
const nombresSucursales = Object.keys(process.env)
  .filter((k) => /^SUCURSAL_\d+$/.test(k))
  .sort((a, b) => Number(a.split("_")[1]) - Number(b.split("_")[1]))
  .map((k) => process.env[k]);
if (nombresSucursales.length === 0) nombresSucursales.push("Sucursal 1");

if (!adminEmail) {
  console.error("Falta ADMIN_EMAIL.");
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

async function main() {
  console.log(`Creando tenant "${tenantNombre}"...`);
  const { data: tenant, error: errTenant } = await admin
    .from("tenants")
    .insert({ nombre: tenantNombre })
    .select()
    .single();
  if (errTenant) throw errTenant;

  console.log(`Creando sucursal(es): ${nombresSucursales.join(", ")}...`);
  const { data: sucursales, error: errSuc } = await admin
    .from("sucursales")
    .insert(nombresSucursales.map((nombre) => ({ tenant_id: tenant.id, nombre })))
    .select();
  if (errSuc) throw errSuc;

  console.log("Habilitando efectivo como forma de pago inicial...");
  await admin.from("formas_pago_sucursal").insert(
    sucursales.flatMap((s) => [{ sucursal_id: s.id, forma_pago: "efectivo", activo: true }])
  );

  console.log(`Creando usuario admin (${adminEmail})...`);
  const { data: authUser, error: errAuth } = await admin.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
  });
  if (errAuth) throw errAuth;

  const { error: errPerfil } = await admin.from("usuarios").insert({
    id: authUser.user.id,
    tenant_id: tenant.id,
    sucursal_id: null,
    rol: "admin",
    nombre: adminNombre,
  });
  if (errPerfil) throw errPerfil;

  console.log("\nListo. Datos creados:");
  console.log(`  tenant_id: ${tenant.id}`);
  console.log(`  sucursales: ${sucursales.map((s) => `${s.nombre} (${s.id})`).join(", ")}`);
  console.log(`  admin: ${adminEmail} / ${adminPassword}`);
  console.log("\nInicia sesión con ese correo/contraseña en /login y cambia la contraseña cuanto antes.");
}

main().catch((err) => {
  console.error("Error en el seed:", err);
  process.exit(1);
});
