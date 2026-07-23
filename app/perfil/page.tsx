import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfil } from "@/lib/perfil";
import { getReputacion } from "@/app/actions/viaje";
import { estrellas } from "@/lib/formato";
import PerfilForm from "./perfil-form";

export default async function PerfilPage() {
  const supabase = await createClient();
  const { profile, vehicle } = await getPerfil(supabase);
  if (!profile) redirect("/login");

  const reputacion = estrellas(await getReputacion(profile.id));

  return (
    <PerfilForm profile={profile} vehicle={vehicle} reputacion={reputacion} />
  );
}
