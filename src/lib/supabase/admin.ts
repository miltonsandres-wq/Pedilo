import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";

/**
 * Cliente con la service_role key: se salta RLS por completo.
 * SOLO usar en Server Actions muy puntuales que un admin dispara a propósito
 * (ej. crear el usuario de Auth de un nuevo cajero/mesero). Nunca importar
 * esto desde un Client Component ni exponer la key con prefijo NEXT_PUBLIC_.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
