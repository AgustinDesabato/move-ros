import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const RUTAS_PUBLICAS = [
  "/bienvenida",
  "/login",
  "/registro",
  "/recuperar",
  "/restablecer",
  "/auth/confirmar",
];

// Refresca la sesión de Supabase en cada request y protege las rutas:
// si no hay usuario y la ruta no es pública, redirige a /bienvenida.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          );
        },
      },
    },
  );

  // IMPORTANTE: llamar a getUser() antes de generar la respuesta para que
  // un eventual refresco de token se escriba en las cookies.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const esRutaPublica = RUTAS_PUBLICAS.includes(request.nextUrl.pathname);

  if (!user && !esRutaPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/bienvenida";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
