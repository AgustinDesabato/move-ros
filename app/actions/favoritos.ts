"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { LugarFavorito } from "@/lib/supabase/types";
import {
  FAVORITOS_MAX,
  validarNombreLugar,
  type ErroresCampo,
} from "@/lib/validacion";

export type CampoFavorito = "nombre" | "direccion";

// `error` es lo que no es de un campo (tope alcanzado, fallo al guardar);
// `errores` va debajo de cada campo y `valores` precarga lo escrito para que
// el reset del formulario no lo borre.
export type FavoritoState =
  | {
      error?: string;
      errores?: ErroresCampo<CampoFavorito>;
      valores?: Record<string, string>;
    }
  | undefined;

// Los lugares favoritos del usuario logueado (RLS acota a los suyos), en el
// orden en que los cargó.
export async function getFavoritos(): Promise<LugarFavorito[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("lugares_favoritos")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(FAVORITOS_MAX);
  return (data as LugarFavorito[] | null) ?? [];
}

// Guarda un lugar con nombre. La dirección y sus coordenadas llegan en campos
// ocultos que el formulario completa al elegir una sugerencia del buscador.
export async function agregarFavorito(
  _prevState: FavoritoState,
  formData: FormData,
): Promise<FavoritoState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const valores = {
    nombre: (formData.get("nombre") ?? "").toString(),
    direccion: (formData.get("direccion") ?? "").toString(),
    lat: (formData.get("lat") ?? "").toString(),
    lng: (formData.get("lng") ?? "").toString(),
  };
  const rNombre = validarNombreLugar(valores.nombre);
  const direccion = valores.direccion.trim();
  const lat = Number(valores.lat);
  const lng = Number(valores.lng);
  const direccionOk =
    direccion !== "" &&
    valores.lat.trim() !== "" &&
    valores.lng.trim() !== "" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180;
  if (!rNombre.ok || !direccionOk) {
    const errores: ErroresCampo<CampoFavorito> = {};
    if (!rNombre.ok) errores.nombre = rNombre.error;
    if (!direccionOk) errores.direccion = "Elegí una dirección de la lista.";
    return { errores, valores };
  }

  const { count } = await supabase
    .from("lugares_favoritos")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) >= FAVORITOS_MAX) {
    return {
      error: `Podés guardar hasta ${FAVORITOS_MAX} lugares. Quitá uno para agregar otro.`,
      valores,
    };
  }

  const { error } = await supabase.from("lugares_favoritos").insert({
    usuario_id: user.id,
    nombre: rNombre.valor,
    direccion,
    lat,
    lng,
  });
  if (error) {
    // El único índice único de la tabla es el del nombre por usuario.
    if (error.code === "23505" && error.message.includes("lugares_favoritos_usuario_nombre_idx")) {
      return { errores: { nombre: "Ya tenés un lugar con ese nombre." }, valores };
    }
    return { error: "No se pudo guardar el lugar. Intentá de nuevo.", valores };
  }

  revalidatePath("/perfil/favoritos");
  revalidatePath("/viajar");
}

export async function quitarFavorito(id: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.from("lugares_favoritos").delete().eq("id", id);
  revalidatePath("/perfil/favoritos");
  revalidatePath("/viajar");
}
