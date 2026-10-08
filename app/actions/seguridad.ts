"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AlertaSoporte, ContactoConfianza } from "@/lib/supabase/types";
import {
  validarNombreContacto,
  validarTelefono,
  type ErroresCampo,
} from "@/lib/validacion";

export type CampoContacto = "nombre" | "telefono";

// `error` es lo que no es de un campo (fallo al guardar); `errores` va debajo
// de cada campo y `valores` precarga lo escrito para que el reset del
// formulario no lo borre.
export type ContactoState =
  | {
      error?: string;
      errores?: ErroresCampo<CampoContacto>;
      valores?: Record<string, string>;
    }
  | undefined;

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

  const valores = {
    nombre: (formData.get("nombre") ?? "").toString(),
    telefono: (formData.get("telefono") ?? "").toString(),
  };
  const rNombre = validarNombreContacto(valores.nombre);
  const rTelefono = validarTelefono(valores.telefono);
  if (!rNombre.ok || !rTelefono.ok) {
    const errores: ErroresCampo<CampoContacto> = {};
    if (!rNombre.ok) errores.nombre = rNombre.error;
    if (!rTelefono.ok) errores.telefono = rTelefono.error;
    return { errores, valores };
  }

  const { error } = await supabase
    .from("contactos_confianza")
    .insert({ usuario_id: user.id, nombre: rNombre.valor, telefono: rTelefono.valor });
  if (error) {
    return { error: "No se pudo agregar el contacto. Intentá de nuevo.", valores };
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

// Todas las alertas de todos los usuarios (Spec 23). La RPC devuelve vacío si
// quien llama no tiene role = 'soporte'.
export async function getAlertasSoporte(): Promise<AlertaSoporte[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("alertas_soporte");
  return (data as AlertaSoporte[] | null) ?? [];
}
