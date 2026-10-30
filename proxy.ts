import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Corre en todas las rutas salvo assets estáticos (incluido el worker de
    // MapLibre en public/maplibre/), imágenes y el ícono generado para iOS
    // (Spec 36: /apple-icon no tiene extensión en la URL, así que necesita su
    // propia exclusión además de la de archivos .svg/.png/etc).
    "/((?!_next/static|_next/image|maplibre/|favicon.ico|apple-icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
