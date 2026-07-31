"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { MiInvitacion } from "@/lib/supabase/types";

export type InvitacionState = { error: string } | undefined;

// Las invitaciones pendientes que recibió el conductor (RPC mis_invitaciones).
export async function getMisInvitaciones(): Promise<MiInvitacion[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("mis_invitaciones");
  return (data as MiInvitacion[] | null) ?? [];
}

// El nombre de la remisería a la que pertenece el conductor (null si es
// independiente). RPC security definer: la RLS de profiles no deja al conductor
// leer la fila de su empresa directamente.
export async function getMiEmpresa(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("mi_empresa");
  return (data as string | null) ?? null;
}

// El conductor acepta una invitación: queda vinculado a esa empresa y sus demás
// invitaciones pendientes se autocancelan (lo hace la RPC).
export async function aceptarInvitacion(
  invitacionId: string,
): Promise<InvitacionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("aceptar_invitacion", {
    p_invitacion_id: invitacionId,
  });
  if (error) {
    return { error: error.message || "No se pudo aceptar la invitación." };
  }

  revalidatePath("/perfil");
}

// El conductor rechaza una invitación pendiente (no lo vincula).
export async function rechazarInvitacion(invitacionId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.rpc("rechazar_invitacion", { p_invitacion_id: invitacionId });

  revalidatePath("/perfil");
}
