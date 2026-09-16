import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/types/database.types";

/**
 * Cliente de Supabase para Server Components, Server Actions y Route
 * Handlers. Lee/escribe la sesión desde las cookies de la petición.
 * Sigue usando la anon key: RLS decide qué puede ver/tocar cada usuario
 * según su fila en `usuarios` (tenant_id, rol, sucursal_id).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Se llama desde un Server Component (no puede escribir cookies).
            // El middleware se encarga de refrescar la sesión en ese caso.
          }
        },
      },
    }
  );
}
