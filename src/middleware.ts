import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Rutas públicas que no requieren sesión.
const PUBLIC_PATHS = ["/login", "/registro", "/auth", "/carta"];

export async function middleware(request: NextRequest) {
  // /carta/[token] lo abren clientes sin cuenta (QR de la mesa): ni falta
  // revisar sesión de Supabase para esas peticiones.
  if (request.nextUrl.pathname.startsWith("/carta")) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  // "/" es la landing pública — comparación exacta porque, con startsWith,
  // sería prefijo de cualquier ruta y dejaría todo el sitio sin protección.
  const isPublic = pathname === "/" || PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/registro")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // El middleware solo verifica que haya sesión. La restricción fina por rol
  // (admin vs cajero/mesero) vive en `usuarios` (tabla de negocio, no en los
  // metadatos del JWT) y se valida en el layout de servidor de /admin y /pos,
  // que es quien de verdad conoce el rol vigente.
  return response;
}

export const config = {
  matcher: [
    /*
     * Aplica a todas las rutas menos assets estáticos e imágenes.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
