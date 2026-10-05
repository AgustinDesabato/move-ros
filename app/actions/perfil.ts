"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRole, Vehicle } from "@/lib/supabase/types";
import {
  validarCapacidad,
  validarColor,
  validarMarca,
  validarNombreCompleto,
  validarNombreEmpresa,
  validarPatente,
  validarTelefono,
  validarTextoVehiculo,
  type ErroresCampo,
} from "@/lib/validacion";

const RUTA_POR_ROL: Record<UserRole, string> = {
  pasajero: "/viajar",
  conductor: "/conducir",
  empresa: "/empresa",
  soporte: "/soporte",
};

export type CampoPerfil =
  | "nombre"
  | "telefono"
  | "marca"
  | "modelo"
  | "patente"
  | "color"
  | "capacidad";

// `error` es lo que no es de un campo (fallo al guardar); `errores` va debajo
// de cada campo y `valores` precarga lo escrito para que el reset del
// formulario no lo borre.
export type PerfilState =
  | {
      error?: string;
      errores?: ErroresCampo<CampoPerfil>;
      valores?: Record<string, string>;
    }
  | undefined;

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

  const texto = (campo: string) => (formData.get(campo) ?? "").toString();
  const valores: Record<string, string> = {
    nombre: texto("nombre"),
    telefono: texto("telefono"),
  };

  // Se validan todos los campos antes de cortar, para mostrar todos los
  // errores juntos.
  const errores: ErroresCampo<CampoPerfil> = {};
  const rNombre =
    role === "empresa"
      ? validarNombreEmpresa(valores.nombre)
      : validarNombreCompleto(valores.nombre);
  if (!rNombre.ok) errores.nombre = rNombre.error;
  const rTelefono = validarTelefono(valores.telefono);
  if (!rTelefono.ok) errores.telefono = rTelefono.error;

  let vehiculo: Omit<Vehicle, "conductor_id" | "updated_at"> | null = null;

  if (role === "conductor") {
    for (const campo of ["marca", "modelo", "patente", "color", "capacidad"]) {
      valores[campo] = texto(campo);
    }
    const rMarca = validarMarca(valores.marca);
    const rModelo = validarTextoVehiculo(valores.modelo, "modelo");
    const rPatente = validarPatente(valores.patente);
    const rColor = validarColor(valores.color);
    const rCapacidad = validarCapacidad(valores.capacidad);
    if (!rMarca.ok) errores.marca = rMarca.error;
    if (!rModelo.ok) errores.modelo = rModelo.error;
    if (!rPatente.ok) errores.patente = rPatente.error;
    if (!rColor.ok) errores.color = rColor.error;
    if (!rCapacidad.ok) errores.capacidad = rCapacidad.error;
    if (rMarca.ok && rModelo.ok && rPatente.ok && rColor.ok && rCapacidad.ok) {
      vehiculo = {
        marca: rMarca.valor,
        modelo: rModelo.valor,
        patente: rPatente.valor,
        color: rColor.valor,
        capacidad: rCapacidad.valor,
      };
    }
  }

  if (!rNombre.ok || !rTelefono.ok || Object.keys(errores).length > 0) {
    return { errores, valores };
  }

  // El vehículo va primero: si la patente choca, el perfil no queda guardado a medias.
  if (vehiculo) {
    const { error: errVehiculo } = await supabase
      .from("vehicles")
      .upsert({ conductor_id: user.id, ...vehiculo, updated_at: new Date().toISOString() });
    if (errVehiculo) {
      // El upsert resuelve por conductor_id, así que un 23505 sólo puede ser la patente.
      if (errVehiculo.code === "23505" && errVehiculo.message.includes("vehicles_patente_unica")) {
        return {
          errores: { patente: "Esa patente ya está registrada en otra cuenta." },
          valores,
        };
      }
      console.error("guardarPerfil: vehicles falló:", errVehiculo.code, errVehiculo.message);
      return { error: "No se pudo guardar el vehículo. Intentá de nuevo.", valores };
    }
  }

  const { error: errProfile } = await supabase
    .from("profiles")
    .update({ nombre: rNombre.valor, telefono: rTelefono.valor })
    .eq("id", user.id);
  if (errProfile) {
    console.error("guardarPerfil: profiles falló:", errProfile.code, errProfile.message);
    return { error: "No se pudo guardar el perfil. Intentá de nuevo.", valores };
  }

  redirect(RUTA_POR_ROL[role]);
}
