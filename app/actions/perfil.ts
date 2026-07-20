"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRole, Vehicle } from "@/lib/supabase/types";

const RUTA_POR_ROL: Record<UserRole, string> = {
  pasajero: "/viajar",
  conductor: "/conducir",
};

const TELEFONO_RE = /^[0-9+\-\s]{8,}$/;

export type PerfilState = { error: string } | undefined;

export async function guardarPerfil(
  _prevState: PerfilState,
  formData: FormData,
): Promise<PerfilState> {
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
  const role = profile.role;

  const nombre = (formData.get("nombre") ?? "").toString().trim();
  const telefono = (formData.get("telefono") ?? "").toString().trim();
  if (!nombre) return { error: "Ingresá tu nombre." };
  if (!TELEFONO_RE.test(telefono)) {
    return { error: "Ingresá un teléfono válido (al menos 8 dígitos)." };
  }

  let vehiculo: Omit<Vehicle, "conductor_id" | "updated_at"> | null = null;

  if (role === "conductor") {
    const marca = (formData.get("marca") ?? "").toString().trim();
    const modelo = (formData.get("modelo") ?? "").toString().trim();
    const patente = (formData.get("patente") ?? "").toString().trim();
    const color = (formData.get("color") ?? "").toString().trim();
    const capacidad = Number(formData.get("capacidad"));
    if (!marca || !modelo || !patente || !color) {
      return { error: "Completá todos los datos del vehículo." };
    }
    if (!Number.isInteger(capacidad) || capacidad < 1 || capacidad > 10) {
      return { error: "La capacidad debe ser un número entero entre 1 y 10." };
    }
    vehiculo = { marca, modelo, patente, color, capacidad };
  }

  const { error: errProfile } = await supabase
    .from("profiles")
    .update({ nombre, telefono })
    .eq("id", user.id);
  if (errProfile) {
    return { error: "No se pudo guardar el perfil. Intentá de nuevo." };
  }

  if (vehiculo) {
    const { error: errVehiculo } = await supabase
      .from("vehicles")
      .upsert({ conductor_id: user.id, ...vehiculo, updated_at: new Date().toISOString() });
    if (errVehiculo) {
      return { error: "No se pudo guardar el vehículo. Intentá de nuevo." };
    }
  }

  redirect(RUTA_POR_ROL[role]);
}
