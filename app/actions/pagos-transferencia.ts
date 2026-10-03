"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { DatosCobro, UserRole } from "@/lib/supabase/types";

export type AliasState = { error: string } | { ok: true } | undefined;

const ALIAS_MAX = 60;

// El alias/CVU del usuario logueado (null si todavía no cargó ninguno).
export async function getAliasCvu(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("alias_cvu")
    .eq("id", user.id)
    .maybeSingle<{ alias_cvu: string | null }>();
  return data?.alias_cvu ?? null;
}

// Guarda el alias/CVU con el que cobra el conductor o la remisería. Es un
// self-update de profiles, cubierto por la policy de edición del propio perfil.
export async function guardarAliasCvu(
  _prevState: AliasState,
  formData: FormData,
): Promise<AliasState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: UserRole }>();
  if (!profile) redirect("/login");
  if (profile.role === "pasajero") {
    return { error: "Sólo conductores y remiserías cargan datos de cobro." };
  }

  const alias = (formData.get("alias_cvu") ?? "").toString().trim();
  if (!alias) return { error: "Ingresá tu alias o CVU." };
  if (alias.length > ALIAS_MAX) {
    return { error: `El alias o CVU no puede superar los ${ALIAS_MAX} caracteres.` };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ alias_cvu: alias })
    .eq("id", user.id);
  if (error) {
    return { error: "No se pudo guardar el alias. Intentá de nuevo." };
  }

  revalidatePath("/perfil/pagos");
  return { ok: true };
}

// A quién le transfiere el pasajero de un viaje: la RPC valida que quien llama
// sea el pasajero y resuelve el destinatario (la remisería del conductor si
// pertenece a una, si no el conductor). null si no se pudo resolver.
export async function datosCobro(tripId: string): Promise<DatosCobro | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("datos_cobro", {
    p_trip_id: tripId,
  });
  if (error) return null;
  return (data as DatosCobro[] | null)?.[0] ?? null;
}
