"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Trip } from "@/lib/supabase/types";

// La oferta vigente que ve el conductor, junto con el viaje ofrecido.
export type OfertaActiva = {
  trip: Trip;
  expira_at: string;
};

// Heartbeat de presencia: el poll de /conducir la llama cada POLL_MS para
// marcar al conductor como activo (fuente de la ventana de ~30s del despacho).
export async function heartbeat(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("profiles")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", user.id)
    .eq("role", "conductor");
}

// Reporta la posición GPS del conductor mientras tiene un viaje activo. El poll
// de /conducir la acota a ~POLL_MS aunque watchPosition dé fixes más seguido.
// Va por RPC para que ubic_at lo ponga now() del servidor (fuente única de la
// frescura); la función valida auth.uid() + rol conductor.
export async function reportarUbicacion(
  lat: number,
  lng: number,
): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("reportar_ubicacion", { p_lat: lat, p_lng: lng });
}

// La oferta 'ofrecida' vigente del conductor (o null si no tiene ninguna).
export async function ofertaActual(): Promise<OfertaActiva | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("trip_offers")
    .select("expira_at, trips(*)")
    .eq("conductor_id", user.id)
    .eq("estado", "ofrecida")
    .gt("expira_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = data as { expira_at: string; trips: Trip | null } | null;
  if (!row?.trips) return null;
  return { trip: row.trips, expira_at: row.expira_at };
}

// El viaje que el conductor tiene asignado y activo (aceptada/en_curso), o null.
export async function viajeAsignado(): Promise<Trip | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("trips")
    .select("*")
    .eq("conductor_id", user.id)
    .in("estado", ["aceptada", "en_curso"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as Trip | null) ?? null;
}

// --- Transiciones: toda la lógica vive en las funciones RPC security definer. ---

export async function aceptarOferta(tripId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("aceptar_oferta", { p_trip_id: tripId });
  revalidatePath("/conducir");
}

export async function rechazarOferta(tripId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("rechazar_oferta", { p_trip_id: tripId });
  revalidatePath("/conducir");
}

export async function iniciarViaje(tripId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("iniciar_viaje", { p_trip_id: tripId });
  revalidatePath("/conducir");
}

export async function finalizarViaje(tripId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("finalizar_viaje", { p_trip_id: tripId });
  revalidatePath("/conducir");
}

export async function bajarseViaje(tripId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("bajarse_viaje", { p_trip_id: tripId });
  revalidatePath("/conducir");
}
