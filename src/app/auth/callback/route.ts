import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * A donde Supabase manda de vuelta al navegador después de que el usuario
 * autoriza con Google (ver signInWithOAuth en /login y /registro). Cambia el
 * código de un solo uso por una sesión real y decide a dónde sigue: si ya
 * tiene fila en `usuarios` (ya se registró antes), a `next`/"/"; si es la
 * primera vez que entra con esa cuenta de Google, a /registro/completar para
 * que dé de alta sus sucursales.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: usuario } = await supabase
          .from("usuarios")
          .select("id")
          .eq("id", user.id)
          .maybeSingle();

        if (!usuario) {
          return NextResponse.redirect(`${origin}/registro/completar`);
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
