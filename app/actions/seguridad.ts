"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ContactoConfianza } from "@/lib/supabase/types";

export type ContactoState = { error: string } | undefined;

const TELEFONO_RE = /^[0-9+\-\s]{8,}$/;

// Los contactos de confianza del usuario logueado (RLS acota a los suyos).
export async function getContactos(): Promise<ContactoConfianza[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contactos_confianza")
    .select("*")
    .order("created_at", { ascending: true });
  return (data as ContactoConfianza[] | null) ?? [];
}

export async function agregarContacto(
  _prevState: ContactoState,
  formData: FormData,
): Promise<ContactoState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const nombre = (formData.get("nombre") ?? "").toString().trim();
  const telefono = (formData.get("telefono") ?? "").toString().trim();
  if (!nombre) return { error: "Ingresá el nombre del contacto." };
  if (!TELEFONO_RE.test(telefono)) {
    return { error: "Ingresá un teléfono válido (al menos 8 dígitos)." };
  }

  const { error } = await supabase
    .from("contactos_confianza")
    .insert({ usuario_id: user.id, nombre, telefono });
  if (error) {
    return { error: "No se pudo agregar el contacto. Intentá de nuevo." };
  }

  revalidatePath("/perfil/contactos");
}

export async function quitarContacto(id: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.from("contactos_confianza").delete().eq("id", id);
  revalidatePath("/perfil/contactos");
}

// Registra una alerta de emergencia del pasajero durante un viaje en curso.
// La ubicación es la que el navegador pudo dar en ese instante; si no hay fix
// (permiso denegado, timeout), igual se registra la alerta sin coordenadas:
// una alerta sin ubicación es mejor que ninguna alerta. No redirige ni tira
// error visible: no debe interferir con la llamada al 911 en paralelo.
export async function registrarAlerta(
  tripId: string,
  ubicacion: { lat: number; lng: number } | null,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("alertas_emergencia").insert({
    trip_id: tripId,
    usuario_id: user.id,
    ubic_lat: ubicacion?.lat ?? null,
    ubic_lng: ubicacion?.lng ?? null,
  });
}
