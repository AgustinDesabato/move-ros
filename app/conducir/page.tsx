import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, perfilCompleto } from "@/lib/perfil";
import PanelConductor from "./panel-conductor";

export default async function ConducirPage() {
  const supabase = await createClient();
  const { profile, vehicle } = await getPerfil(supabase);

  if (!profile) redirect("/login");
  if (profile.role === "pasajero") redirect("/viajar");
  if (profile.role === "empresa") redirect("/empresa");
  if (profile.role === "soporte") redirect("/soporte");
  if (!perfilCompleto(profile, vehicle)) redirect("/perfil");

  return (
    <PanelConductor
      nombre={profile.nombre ?? ""}
      enLineaInicial={profile.en_linea}
    />
  );
}
