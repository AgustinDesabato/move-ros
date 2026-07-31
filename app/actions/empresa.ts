"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type {
  EmpresaConductor,
  InvitacionPendiente,
  ViajeConductor,
} from "@/lib/supabase/types";

export type EmpresaState = { error: string } | undefined;

// Invita (por email) a un conductor ya registrado a la empresa que llama: crea
// una invitación pendiente que el conductor tiene que aceptar. La RPC valida rol,
// existencia y pertenencia; sus mensajes de error ya son legibles.
export async function invitarConductor(email: string): Promise<EmpresaState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("invitar_conductor", {
    p_email: email.trim(),
  });
  if (error) {
    return { error: error.message || "No se pudo invitar al conductor." };
  }

  revalidatePath("/empresa");
}

// Las invitaciones pendientes que mandó la empresa (RPC empresa_invitaciones).
export async function getInvitaciones(): Promise<InvitacionPendiente[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("empresa_invitaciones");
  return (data as InvitacionPendiente[] | null) ?? [];
}

// Cancela una invitación pendiente que mandó la empresa (RPC cancelar_invitacion).
export async function cancelarInvitacion(invitacionId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.rpc("cancelar_invitacion", { p_invitacion_id: invitacionId });

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
