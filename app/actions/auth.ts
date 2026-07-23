"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/supabase/types";

const RUTA_POR_ROL: Record<UserRole, string> = {
  pasajero: "/viajar",
  conductor: "/conducir",
  empresa: "/empresa",
};

export type AuthState = { error: string } | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function traducirErrorSignUp(mensaje: string): string {
  if (/already registered|already exists|user already/i.test(mensaje)) {
    return "Ese email ya está registrado.";
  }
  return "No se pudo crear la cuenta. Intentá de nuevo.";
}

export async function registrarse(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = formData.get("email");
  const password = formData.get("password");
  const role = formData.get("role");

  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    return { error: "Ingresá un email válido." };
  }
  if (typeof password !== "string" || password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }
  if (role !== "pasajero" && role !== "conductor" && role !== "empresa") {
    return { error: "Elegí un tipo de cuenta válido." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { role } },
  });

  if (error) {
    return { error: traducirErrorSignUp(error.message) };
  }

  redirect(RUTA_POR_ROL[role]);
}

export async function iniciarSesion(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string") {
    return { error: "Completá email y contraseña." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return { error: "Email o contraseña incorrectos." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();

  const role = (profile?.role ?? "pasajero") as UserRole;
  redirect(RUTA_POR_ROL[role]);
}

export async function cerrarSesion() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
