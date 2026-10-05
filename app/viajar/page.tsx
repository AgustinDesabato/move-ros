import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, perfilCompleto } from "@/lib/perfil";
import { destinosRecientes } from "@/app/actions/viaje";
import type { Trip } from "@/lib/supabase/types";
import SelectorViaje from "./selector-viaje";
import ViajePendiente from "./viaje-pendiente";

export default async function ViajarPage() {
  const supabase = await createClient();
  const { profile, vehicle } = await getPerfil(supabase);

  if (!profile) redirect("/login");
  if (profile.role === "conductor") redirect("/conducir");
  if (profile.role === "empresa") redirect("/empresa");
  if (profile.role === "soporte") redirect("/soporte");
  if (!perfilCompleto(profile, vehicle)) redirect("/perfil");

  // Viaje activo: el más reciente aún en curso (pendiente/aceptada/en_curso).
  const { data: viajeActivo } = await supabase
    .from("trips")
    .select("*")
    .eq("pasajero_id", profile.id)
    .in("estado", ["pendiente", "aceptada", "en_curso"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<Trip>();

  // Cada vista es de pantalla completa (mapa + panel); el menú de usuario se
  // abre desde el botón de la esquina.
  if (viajeActivo) return <ViajePendiente initialTrip={viajeActivo} />;

  return (
    <SelectorViaje
      nombre={profile.nombre ?? ""}
      recientes={await destinosRecientes()}
    />
  );
}
