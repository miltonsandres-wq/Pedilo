// Regenera src/lib/types/database.types.ts desde el proyecto de Supabase,
// vía la Management API (no requiere Supabase CLI ni Docker local).
//
// Uso:
//   SUPABASE_ACCESS_TOKEN=sbp_xxx SUPABASE_PROJECT_REF=xxxxxxxx node scripts/gen-types.mjs
import fs from "node:fs";
import path from "node:path";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;

if (!token || !ref) {
  console.error(
    "Faltan variables: SUPABASE_ACCESS_TOKEN (token personal de supabase.com/dashboard/account/tokens) y SUPABASE_PROJECT_REF (id del proyecto)."
  );
  process.exit(1);
}

const res = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/types/typescript?included_schemas=public`,
  { headers: { Authorization: `Bearer ${token}` } }
);

if (!res.ok) {
  console.error("Error generando tipos:", res.status, await res.text());
  process.exit(1);
}

const { types } = await res.json();
const outPath = path.join(process.cwd(), "src/lib/types/database.types.ts");
fs.writeFileSync(outPath, types);
console.log(`Tipos escritos en ${outPath}`);
