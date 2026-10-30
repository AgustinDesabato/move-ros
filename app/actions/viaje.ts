"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, perfilCompleto } from "@/lib/perfil";
import { rutaOSRM } from "@/lib/osrm";
import type { Ruta } from "@/lib/ruteo";
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

const RECIENTES_MAX = 3;
// Cuántos viajes hacia atrás se miran para juntar destinos distintos.
const RECIENTES_VENTANA = 30;

// Últimos destinos distintos del pasajero, el más nuevo primero. Se derivan de
// sus viajes (en cualquier estado): la RLS de trips ya limita la lectura a los
// propios. Dos viajes al mismo lugar cuentan una vez (se comparan por etiqueta).
export async function destinosRecientes(): Promise<Place[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("trips")
    .select("destino_label, destino_lat, destino_lng")
    .eq("pasajero_id", user.id)
    .order("created_at", { ascending: false })
    .limit(RECIENTES_VENTANA);

  const filas = (data ?? []) as Pick<
    Trip,
    "destino_label" | "destino_lat" | "destino_lng"
  >[];
  const vistos = new Set<string>();
  const recientes: Place[] = [];
  for (const f of filas) {
    const clave = f.destino_label.trim().toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    recientes.push({
      lat: f.destino_lat,
      lng: f.destino_lng,
      label: f.destino_label,
    });
    if (recientes.length === RECIENTES_MAX) break;
  }
  return recientes;
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

  let trip = data as Trip | null;
  if (!trip) return null;

  if (trip.estado === "pendiente") {
    await supabase.rpc("despachar_viaje", { p_trip_id: trip.id });
    // El timeout del Spec 24 puede haber cancelado el viaje recién ahora: se
    // relee para que este mismo poll ya lo refleje, sin esperar el siguiente.
    const { data: actualizado } = await supabase
      .from("trips")
      .select("*")
      .eq("id", tripId)
      .eq("pasajero_id", user.id)
      .maybeSingle();
    trip = (actualizado as Trip | null) ?? trip;
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

// Spec 33: ruta por calles del conductor al origen (aceptada) o al destino
// (en_curso). De ella salen el ETA (duracionS, Spec 27) y la línea del mapa
// (puntos). null si no aplica (otro estado, no es el pasajero del viaje), si la
// posición del conductor no está vigente o si OSRM falla. Se llama cada ETA_MS,
// aparte del poll de 5s.
export async function rutaConductor(tripId: string): Promise<Ruta | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: trip } = await supabase
    .from("trips")
    .select("estado, origen_lat, origen_lng, destino_lat, destino_lng")
    .eq("id", tripId)
    .eq("pasajero_id", user.id)
    .maybeSingle();
  if (!trip || (trip.estado !== "aceptada" && trip.estado !== "en_curso")) {
    return null;
  }

  // datos_conductor ya valida pasajero_id = auth.uid() y calcula ubic_vigente
  // con la hora del servidor (Spec 06).
  const { data: cd } = await supabase.rpc("datos_conductor", {
    p_trip_id: tripId,
  });
  const conductor = (cd as ConductorPublico[] | null)?.[0];
  if (
    !conductor?.ubic_vigente ||
    conductor.ubic_lat == null ||
    conductor.ubic_lng == null
  ) {
    return null;
  }

  const puntoFinal =
    trip.estado === "aceptada"
      ? { lat: trip.origen_lat, lng: trip.origen_lng }
      : { lat: trip.destino_lat, lng: trip.destino_lng };

  return rutaOSRM(
    { lat: conductor.ubic_lat, lng: conductor.ubic_lng },
    puntoFinal,
  );
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
