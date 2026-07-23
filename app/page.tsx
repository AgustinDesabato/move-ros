import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfil } from "@/lib/perfil";
import type { UserRole } from "@/lib/supabase/types";

const RUTA_POR_ROL: Record<UserRole, string> = {
  pasajero: "/viajar",
  conductor: "/conducir",
  empresa: "/empresa",
};

// La raíz manda a cada usuario a su vista según el rol. El middleware ya redirige
// a /login a quien no tiene sesión, así que acá siempre hay perfil.
export default async function Home() {
  const supabase = await createClient();
  const { profile } = await getPerfil(supabase);
  if (!profile) redirect("/login");
  redirect(RUTA_POR_ROL[profile.role]);
}
