import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Spec 35 · Destino de una sesión abierta cuya cuenta soporte suspendió. Las
// pantallas principales (Server Components) no pueden borrar las cookies de
// sesión durante el render; un Route Handler sí. Cierra la sesión y muestra
// el aviso en /login.
export async function GET() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login?suspendida=1");
}
