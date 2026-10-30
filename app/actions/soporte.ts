"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { UsuarioSoporte, ViajeSoporte } from "@/lib/supabase/types";

// Todos los usuarios de la plataforma, conductores pendientes de aprobación
// primero (Spec 35). La RPC devuelve vacío si quien llama no es soporte.
export async function getUsuariosSoporte(): Promise<UsuarioSoporte[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("usuarios_soporte");
  return (data as UsuarioSoporte[] | null) ?? [];
}

// Viajes activos y los últimos 50 cerrados de toda la plataforma (Spec 35).
// Mismo criterio de acceso que getUsuariosSoporte().
export async function getViajesSoporte(): Promise<ViajeSoporte[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("viajes_soporte");
  return (data as ViajeSoporte[] | null) ?? [];
}

export type AccionUsuarioState = { error: string } | undefined;

// Traduce el mensaje de la excepción de la RPC a un texto para la UI. Lo que
// no se reconoce (sin permiso, usuario inexistente, falla de red) cae en el
// mensaje genérico.
function errorRpc(message: string | undefined): string {
  const m = message ?? "";
  if (m.includes("viaje activo")) return "El usuario tiene un viaje activo.";
  if (m.includes("vehículo")) return "El conductor todavía no cargó su vehículo.";
  if (m.includes("cuenta de soporte")) return "No se puede suspender una cuenta de soporte.";
  return "No se pudo completar la acción. Intentá de nuevo.";
}

// Aprueba a un conductor pendiente: desde ahora el despacho puede ofrecerle viajes.
export async function aprobarConductor(
  _prevState: AccionUsuarioState,
  formData: FormData,
): Promise<AccionUsuarioState> {
  const userId = (formData.get("user_id") ?? "").toString();

  const supabase = await createClient();
  const { error } = await supabase.rpc("aprobar_conductor", { p_user_id: userId });
  if (error) return { error: errorRpc(error.message) };

  revalidatePath("/soporte/usuarios");
}

// Suspende (suspender = "1") o reactiva (suspender = "0") una cuenta.
export async function suspenderUsuario(
  _prevState: AccionUsuarioState,
  formData: FormData,
): Promise<AccionUsuarioState> {
  const userId = (formData.get("user_id") ?? "").toString();
  const suspender = formData.get("suspender") === "1";

  const supabase = await createClient();
  const { error } = await supabase.rpc("suspender_usuario", {
    p_user_id: userId,
    p_suspender: suspender,
  });
  if (error) return { error: errorRpc(error.message) };

  revalidatePath("/soporte/usuarios");
}
