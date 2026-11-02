import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile, Vehicle } from "@/lib/supabase/types";

// Aviso de cuenta suspendida por soporte (Spec 35): lo muestra /login tanto
// al intentar ingresar como al llegar desde una sesión que se cerró.
export const MENSAJE_SUSPENDIDA =
  "Tu cuenta está suspendida. Escribinos para más información.";

export type PerfilData = {
  profile: Profile | null;
  vehicle: Vehicle | null;
};

// Lee el perfil del usuario logueado y, si es conductor, su vehículo.
export async function getPerfil(supabase: SupabaseClient): Promise<PerfilData> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { profile: null, vehicle: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, nombre, telefono, en_linea, aprobado, suspendido, created_at")
    .eq("id", user.id)
    .single<Profile>();

  if (!profile) return { profile: null, vehicle: null };

  let vehicle: Vehicle | null = null;
  if (profile.role === "conductor") {
    const { data } = await supabase
      .from("vehicles")
      .select("conductor_id, marca, modelo, patente, color, capacidad, updated_at")
      .eq("conductor_id", user.id)
      .maybeSingle<Vehicle>();
    vehicle = data ?? null;
  }

  return { profile, vehicle };
}

// El perfil está completo cuando tiene nombre y teléfono, y —si es conductor—
// además una fila en vehicles (sus columnas son NOT NULL por construcción).
// Para pasajero y empresa alcanza con nombre + teléfono (la empresa no tiene
// vehículo; su `nombre` es el nombre de la remisería).
export function perfilCompleto(
  profile: Profile | null,
  vehicle: Vehicle | null,
): boolean {
  if (!profile) return false;
  if (!profile.nombre || !profile.telefono) return false;
  if (profile.role === "conductor" && !vehicle) return false;
  return true;
}
