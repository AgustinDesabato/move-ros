import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Corre en todas las rutas salvo assets estáticos (incluido el worker de
    // MapLibre en public/maplibre/) e imágenes.
    "/((?!_next/static|_next/image|maplibre/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
