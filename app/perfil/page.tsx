import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfil } from "@/lib/perfil";
import { getReputacion } from "@/app/actions/viaje";
import { getMisInvitaciones, getMiEmpresa } from "@/app/actions/invitaciones";
import { estrellas } from "@/lib/formato";
import type { MiInvitacion } from "@/lib/supabase/types";
import PerfilForm from "./perfil-form";

export default async function PerfilPage() {
  const supabase = await createClient();
  const { profile, vehicle } = await getPerfil(supabase);
  if (!profile) redirect("/login");

  const reputacion = estrellas(await getReputacion(profile.id));

  // Sólo el conductor ve invitaciones y su remisería (ver Spec 11).
  let invitaciones: MiInvitacion[] = [];
  let empresaNombre: string | null = null;
  if (profile.role === "conductor") {
    [invitaciones, empresaNombre] = await Promise.all([
      getMisInvitaciones(),
      getMiEmpresa(),
    ]);
  }

  return (
    <PerfilForm
      profile={profile}
      vehicle={vehicle}
      reputacion={reputacion}
      invitaciones={invitaciones}
      empresaNombre={empresaNombre}
    />
  );
}
