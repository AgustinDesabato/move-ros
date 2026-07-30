"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, perfilCompleto } from "@/lib/perfil";
import { rutaOSRM } from "@/lib/osrm";
import { calcularTarifa } from "@/lib/tarifa";
import type { Place } from "@/lib/geocode";
import type {
  Trip,
  ConductorPublico,
  Reputacion,
  MetodoPago,
} from "@/lib/supabase/types";

export type ViajeState = { error: string } | undefined;

// Estado del viaje activo del pasajero + datos del conductor asignado (si hay).
export type EstadoViaje = {
  trip: Trip;
  conductor: ConductorPublico | null;
} | null;

// Crea la solicitud de viaje. Recalcula ruta y tarifa del lado del servidor
// (no confía en los números del cliente) e inserta la fila en estado pendiente.
export async function solicitarViaje(
  origen: Place,
  destino: Place,
  metodo: MetodoPago,
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
    metodo_pago: metodo,
  });
  if (error) {
    return { error: "No se pudo crear la solicitud. Intentá de nuevo." };
  }

  revalidatePath("/viajar");
  redirect("/viajar");
}

// Devuelve el estado actual de un viaje puntual del pasajero (el que la vista está
// siguiendo) y, si está asignado, los datos públicos del conductor. Seguir el viaje
// por id evita que server y cliente miren viajes distintos. Mientras está pendiente,
// el poll del pasajero es el reloj del despacho: dispara despachar_viaje.
export async function estadoViajeActivo(tripId: string): Promise<EstadoViaje> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("trips")
    .select("*")
    .eq("id", tripId)
    .eq("pasajero_id", user.id)
    .maybeSingle();

  const trip = data as Trip | null;
  // Si no existe o ya terminó en cancelada, la vista vuelve al selector.
  if (!trip || trip.estado === "cancelada") return null;

  if (trip.estado === "pendiente") {
    await supabase.rpc("despachar_viaje", { p_trip_id: trip.id });
  }

  let conductor: ConductorPublico | null = null;
  if (trip.conductor_id) {
    const { data: cd } = await supabase.rpc("datos_conductor", {
      p_trip_id: trip.id,
    });
    conductor = (cd as ConductorPublico[] | null)?.[0] ?? null;
  }

  return { trip, conductor };
}

// Cancela la solicitud del pasajero. La RPC permite cancelar en 'pendiente' o
// 'aceptada' y vence las ofertas activas del viaje, todo del lado del servidor.
export async function cancelarViaje(tripId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.rpc("cancelar_viaje", { p_trip_id: tripId });

  revalidatePath("/viajar");
}

// Califica la contraparte de un viaje finalizado. La RPC valida estado y
// pertenencia, infiere el destinatario y es idempotente (no duplica). estrellas
// 1-5; comentario opcional (máx. 280, lo recorta/normaliza el servidor).
export async function calificarViaje(
  tripId: string,
  estrellas: number,
  comentario: string,
): Promise<ViajeState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("calificar_viaje", {
    p_trip_id: tripId,
    p_estrellas: estrellas,
    p_comentario: comentario.trim() || null,
  });
  if (error) {
    return { error: "No se pudo guardar la calificación. Intentá de nuevo." };
  }

  revalidatePath("/viajes");
}

// Promedio de estrellas recibidas por un usuario. La RPC reputacion es
// security definer y devuelve sólo el agregado (nunca comentarios ni autores).
export async function getReputacion(userId: string): Promise<Reputacion> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("reputacion", { p_user_id: userId });
  return (data as Reputacion[] | null)?.[0] ?? { promedio: null, cantidad: 0 };
}
