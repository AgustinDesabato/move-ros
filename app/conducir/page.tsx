import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, perfilCompleto } from "@/lib/perfil";
import CuentaPendiente from "./cuenta-pendiente";
import PanelConductor from "./panel-conductor";

export default async function ConducirPage() {
  const supabase = await createClient();
  const { profile, vehicle } = await getPerfil(supabase);

  if (!profile) redirect("/login");
  if (profile.suspendido) redirect("/auth/suspendida");
  if (profile.role === "pasajero") redirect("/viajar");
  if (profile.role === "empresa") redirect("/empresa");
  if (profile.role === "soporte") redirect("/soporte");
  if (!perfilCompleto(profile, vehicle)) redirect("/perfil");
  // Spec 35: sin aprobación de soporte, el despacho no le ofrece viajes.
  if (!profile.aprobado) return <CuentaPendiente nombre={profile.nombre ?? ""} />;

  return (
    <PanelConductor
      nombre={profile.nombre ?? ""}
      enLineaInicial={profile.en_linea}
    />
  );
}
