import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, perfilCompleto } from "@/lib/perfil";
import { destinosRecientes } from "@/app/actions/viaje";
import { getFavoritos } from "@/app/actions/favoritos";
import type { Trip } from "@/lib/supabase/types";
import SelectorViaje from "./selector-viaje";
import ViajePendiente from "./viaje-pendiente";

export default async function ViajarPage() {
  const supabase = await createClient();
  const { profile, vehicle } = await getPerfil(supabase);

  if (!profile) redirect("/login");
  if (profile.suspendido) redirect("/auth/suspendida");
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

  const [favoritos, recientes] = await Promise.all([
    getFavoritos(),
    destinosRecientes(),
  ]);
  // Un reciente que ya es favorito no se repite (Spec 26). Misma comparación
  // de etiquetas con la que destinosRecientes() quita sus repetidos.
  const clave = (s: string) => s.trim().toLowerCase();
  const direccionesFavoritas = new Set(favoritos.map((f) => clave(f.direccion)));

  return (
    <SelectorViaje
      nombre={profile.nombre ?? ""}
      favoritos={favoritos}
      recientes={recientes.filter((r) => !direccionesFavoritas.has(clave(r.label)))}
    />
  );
}
