"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type {
  EstadisticaConductor,
  InvitacionPendiente,
  Periodo,
  ResumenEmpresa,
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
// La RPC tira error legible si la invitación ya no estaba pendiente.
export async function cancelarInvitacion(
  invitacionId: string,
): Promise<EmpresaState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("cancelar_invitacion", {
    p_invitacion_id: invitacionId,
  });
  if (error) {
    return { error: error.message || "No se pudo cancelar la invitación." };
  }

  revalidatePath("/empresa");
}

// Desvincula a un conductor de la empresa (lo devuelve a independiente). La RPC
// tira error legible si no tocó ninguna fila (evita el "éxito fantasma").
export async function quitarConductor(
  conductorId: string,
): Promise<EmpresaState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("quitar_conductor", {
    p_conductor_id: conductorId,
  });
  if (error) {
    return { error: error.message || "No se pudo quitar el conductor." };
  }

  revalidatePath("/empresa");
}

// Los totales del período (RPC empresa_resumen). null si la consulta falla
// (p. ej. la migración 0017 todavía no está aplicada).
export async function getResumen(periodo: Periodo): Promise<ResumenEmpresa | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .rpc("empresa_resumen", { p_periodo: periodo })
    .maybeSingle();
  return (data as ResumenEmpresa | null) ?? null;
}

// Los conductores de la empresa (y los ex conductores con viajes cobrados en el
// período) con sus cifras del período (RPC empresa_estadisticas_conductores).
export async function getEstadisticasConductores(
  periodo: Periodo,
): Promise<EstadisticaConductor[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("empresa_estadisticas_conductores", {
    p_periodo: periodo,
  });
  return (data as EstadisticaConductor[] | null) ?? [];
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
