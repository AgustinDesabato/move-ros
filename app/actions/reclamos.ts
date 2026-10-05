"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ReclamoConViaje, ReclamoSoporte } from "@/lib/supabase/types";

export type ReclamoState = { error: string } | undefined;

// Los reclamos del usuario logueado (RLS acota a los suyos), con el
// origen/destino del viaje asociado si lo hay.
export async function getReclamos(): Promise<ReclamoConViaje[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reclamos")
    .select("*, trips(origen_label, destino_label)")
    .order("created_at", { ascending: false });
  return (data as ReclamoConViaje[] | null) ?? [];
}

// Crea un reclamo, ligado o no a un viaje. Si viene trip_id, el RLS del
// insert exige que el viaje sea propio (pasajero o conductor); si no lo es,
// el insert falla y se muestra un error genérico.
export async function crearReclamo(
  _prevState: ReclamoState,
  formData: FormData,
): Promise<ReclamoState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const motivo = (formData.get("motivo") ?? "").toString().trim();
  const descripcion = (formData.get("descripcion") ?? "").toString().trim();
  const tripId = (formData.get("trip_id") ?? "").toString().trim() || null;

  if (!motivo) return { error: "Ingresá el motivo del reclamo." };
  if (descripcion.length < 10) {
    return { error: "Contanos un poco más (al menos 10 caracteres)." };
  }

  const { error } = await supabase
    .from("reclamos")
    .insert({ usuario_id: user.id, trip_id: tripId, motivo, descripcion });
  if (error) {
    return { error: "No se pudo enviar el reclamo. Intentá de nuevo." };
  }

  revalidatePath("/perfil/reclamos");
  revalidatePath("/viajes");
}

// Todos los reclamos de todos los usuarios (Spec 22). La RPC devuelve vacío
// si quien llama no tiene role = 'soporte'.
export async function getReclamosSoporte(): Promise<ReclamoSoporte[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("reclamos_soporte");
  return (data as ReclamoSoporte[] | null) ?? [];
}

export type ResolverReclamoState = { error: string } | undefined;

// Marca un reclamo como resuelto con una respuesta. La RPC exige role =
// 'soporte', respuesta no vacía y un id existente; cualquier falla de esas
// cae en el mismo mensaje genérico.
export async function resolverReclamo(
  _prevState: ResolverReclamoState,
  formData: FormData,
): Promise<ResolverReclamoState> {
  const reclamoId = (formData.get("reclamo_id") ?? "").toString();
  const respuesta = (formData.get("respuesta") ?? "").toString().trim();
  if (respuesta.length < 10) {
    return { error: "Escribí una respuesta de al menos 10 caracteres." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("resolver_reclamo", {
    p_reclamo_id: reclamoId,
    p_respuesta: respuesta,
  });
  if (error) {
    return { error: "No se pudo resolver el reclamo. Intentá de nuevo." };
  }

  revalidatePath("/soporte");
  revalidatePath("/perfil/reclamos");
}
