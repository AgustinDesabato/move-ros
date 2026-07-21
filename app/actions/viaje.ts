"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, perfilCompleto } from "@/lib/perfil";
import { rutaOSRM } from "@/lib/osrm";
import { calcularTarifa } from "@/lib/tarifa";
import type { Place } from "@/lib/geocode";

export type ViajeState = { error: string } | undefined;

// Crea la solicitud de viaje. Recalcula ruta y tarifa del lado del servidor
// (no confía en los números del cliente) e inserta la fila en estado pendiente.
export async function solicitarViaje(
  origen: Place,
  destino: Place,
): Promise<ViajeState> {
  const supabase = await createClient();
  const { profile, vehicle } = await getPerfil(supabase);

  if (!profile) redirect("/login");
  if (profile.role !== "pasajero") redirect("/conducir");
  if (!perfilCompleto(profile, vehicle)) redirect("/perfil");

  // Una sola solicitud activa por pasajero a la vez.
  const { data: activa } = await supabase
    .from("trips")
    .select("id")
    .eq("pasajero_id", profile.id)
    .eq("estado", "pendiente")
    .maybeSingle();
  if (activa) {
    revalidatePath("/viajar");
    return { error: "Ya tenés una solicitud de viaje pendiente." };
  }

  // Ruta y tarifa autoritativas (recalculadas en el servidor).
  const ruta = await rutaOSRM(origen, destino);
  if (!ruta) {
    return { error: "No pudimos calcular la ruta. Probá de nuevo." };
  }
  const tarifa = calcularTarifa(ruta.distanciaM, ruta.duracionS);

  const { error } = await supabase.from("trips").insert({
    pasajero_id: profile.id,
    origen_lat: origen.lat,
    origen_lng: origen.lng,
    origen_label: origen.label,
    destino_lat: destino.lat,
    destino_lng: destino.lng,
    destino_label: destino.label,
    distancia_m: ruta.distanciaM,
    duracion_s: ruta.duracionS,
    tarifa_estimada: tarifa,
    estado: "pendiente",
  });
  if (error) {
    return { error: "No se pudo crear la solicitud. Intentá de nuevo." };
  }

  revalidatePath("/viajar");
  redirect("/viajar");
}

// Cancela la solicitud del pasajero (la RLS garantiza que sea suya).
export async function cancelarViaje(tripId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("trips")
    .update({ estado: "cancelada" })
    .eq("id", tripId)
    .eq("pasajero_id", user.id);

  revalidatePath("/viajar");
}
