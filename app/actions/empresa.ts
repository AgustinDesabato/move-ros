"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { EmpresaConductor, ViajeConductor } from "@/lib/supabase/types";

export type EmpresaState = { error: string } | undefined;

// Agrega un conductor ya registrado (por email) a la empresa que llama. La RPC
// valida rol, existencia y pertenencia; sus mensajes de error ya son legibles.
export async function agregarConductor(email: string): Promise<EmpresaState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("agregar_conductor", {
    p_email: email.trim(),
  });
  if (error) {
    return { error: error.message || "No se pudo agregar el conductor." };
  }

  revalidatePath("/empresa");
}

// Desvincula a un conductor de la empresa (lo devuelve a independiente).
export async function quitarConductor(conductorId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.rpc("quitar_conductor", { p_conductor_id: conductorId });

  revalidatePath("/empresa");
}

// Los conductores de la empresa con las métricas del día (RPC empresa_conductores).
export async function getConductores(): Promise<EmpresaConductor[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("empresa_conductores");
  return (data as EmpresaConductor[] | null) ?? [];
}

// Los viajes cerrados de un conductor de la empresa (RPC empresa_viajes_conductor).
export async function getViajesConductor(
  conductorId: string,
): Promise<ViajeConductor[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("empresa_viajes_conductor", {
    p_conductor_id: conductorId,
  });
  return (data as ViajeConductor[] | null) ?? [];
}
