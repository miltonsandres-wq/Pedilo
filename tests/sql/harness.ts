import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import fs from "node:fs";
import path from "node:path";

// Stubs mínimos de lo que Supabase da "gratis" (auth, storage, roles,
// publicación de realtime) para poder aplicar las migraciones reales en un
// Postgres local (PGlite) y probar triggers, RPCs y RLS de verdad.
const STUBS = `
create role authenticated;
create role anon;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (bucket_id text, name text);
create function storage.foldername(name text) returns text[] language sql as
  $$ select string_to_array(name, '/') $$;
create publication supabase_realtime;
grant usage on schema public, auth to authenticated, anon;
`;

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

export async function crearBaseConMigraciones(): Promise<PGlite> {
  // Los parsers imitan lo que devuelve PostgREST (numeric como número, fechas como texto ISO)
  const pg = new PGlite({
    extensions: { btree_gist, pgcrypto },
    parsers: {
      1700: (v: string) => parseFloat(v),
      1184: (v: string) => new Date(v).toISOString(),
      1082: (v: string) => v,
    },
  });
  await pg.exec(STUBS);
  const archivos = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const f of archivos) {
    try {
      await pg.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
    } catch (e) {
      throw new Error(`Falló la migración ${f}: ${(e as Error).message}`);
    }
  }
  // Supabase da estos privilegios por defecto a authenticated
  await pg.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
    grant select on all tables in schema public to anon;
  `);
  // revoke de la migración 0018 se re-aplica tras el grant global
  await pg.exec(`
    revoke insert, update, delete on public.documentos_fiscales from authenticated;
    revoke insert, delete on public.incidentes_fiscales from authenticated;
  `);
  return pg;
}

/** Ejecuta `fn` como el usuario `userId` con el rol `authenticated` (así corre RLS). */
export async function comoUsuario<T>(pg: PGlite, userId: string, fn: () => Promise<T>): Promise<T> {
  await pg.exec(`select set_config('request.jwt.claim.sub', '${userId}', false); set role authenticated;`);
  try {
    return await fn();
  } finally {
    await pg.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

/**
 * Ejecuta `fn` como un repartidor (JWT propio: rol authenticated + claim
 * `repartidor_id`; su `sub` no existe en `usuarios`, así que no es personal).
 */
export async function comoRepartidor<T>(pg: PGlite, repartidorId: string, fn: () => Promise<T>): Promise<T> {
  const claims = JSON.stringify({ sub: repartidorId, role: "authenticated", repartidor_id: repartidorId });
  await pg.exec(
    `select set_config('request.jwt.claim.sub', '${repartidorId}', false);
     select set_config('request.jwt.claims', '${claims}', false);
     set role authenticated;`
  );
  try {
    return await fn();
  } finally {
    await pg.exec(
      `reset role; select set_config('request.jwt.claim.sub', '', false); select set_config('request.jwt.claims', '', false);`
    );
  }
}
