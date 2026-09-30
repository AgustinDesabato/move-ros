"use server";

import { redirect } from "next/navigation";
import type { AuthError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/supabase/types";

const RUTA_POR_ROL: Record<UserRole, string> = {
  pasajero: "/viajar",
  conductor: "/conducir",
  empresa: "/empresa",
};

// `error` se muestra en rojo; `aviso` es informativo (la acción salió bien pero
// falta un paso, como confirmar el email).
export type AuthState =
  | { error: string; aviso?: never }
  | { aviso: string; error?: never }
  | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TELEFONO_RE = /^[0-9+\-\s]{8,}$/; // mismo criterio que guardarPerfil

const ERROR_SERVICIO =
  "No pudimos conectar con el servidor. Probá de nuevo en unos minutos.";

// Distingue un fallo de infraestructura (proyecto de Supabase pausado, caído o
// sin red) de un error de negocio. Supabase devuelve AuthRetryableFetchError sin
// status —o con status 5xx— cuando no logra hablar con el backend. Sin esta
// distinción cualquier caída se le muestra al usuario como credenciales mal.
function esFalloDeServicio(error: AuthError): boolean {
  return error.status === undefined || error.status === 0 || error.status >= 500;
}

// El mensaje real de Supabase solo va a los logs del servidor (Runtime Logs en
// Vercel): al navegador va una versión sin detalles internos.
function registrarFallo(operacion: string, error: AuthError): void {
  console.error(`${operacion} falló:`, error.code ?? error.status, error.message);
}

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
  // La remisería manda sólo "nombre" (el de la empresa); pasajero y conductor,
  // nombre y apellido por separado.
  const nombre = [formData.get("nombre"), formData.get("apellido")]
    .map((v) => (v ?? "").toString().trim())
    .filter(Boolean)
    .join(" ");
  const telefono = (formData.get("telefono") ?? "").toString().trim();

  if (role !== "pasajero" && role !== "conductor" && role !== "empresa") {
    return { error: "Elegí un tipo de cuenta válido." };
  }
  if (!nombre) {
    return { error: "Ingresá tu nombre." };
  }
  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    return { error: "Ingresá un email válido." };
  }
  if (!TELEFONO_RE.test(telefono)) {
    return { error: "Ingresá un teléfono válido (al menos 8 dígitos)." };
  }
  if (typeof password !== "string" || password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }
  if (formData.get("terminos") !== "on") {
    return { error: "Tenés que aceptar los términos y la política de privacidad." };
  }

  const supabase = await createClient();
  // nombre y teléfono viajan también en la metadata: si hace falta confirmar el
  // email no hay sesión para escribir el perfil, y /perfil/editar los precarga
  // desde ahí.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { role, nombre, telefono } },
  });

  if (error) {
    registrarFallo("signUp", error);
    if (esFalloDeServicio(error)) {
      return { error: ERROR_SERVICIO };
    }
    return { error: traducirErrorSignUp(error.message) };
  }

  // Con "Confirm email" activado, Supabase no delata los emails ya usados: para
  // uno existente devuelve un usuario sin identidades en vez de un error.
  if (data.user && data.user.identities?.length === 0) {
    return { error: "Ese email ya está registrado." };
  }

  // También con "Confirm email" activado, signUp no abre sesión. Redirigir acá
  // haría que el proxy no encuentre usuario y rebote al login sin explicar nada.
  if (!data.session) {
    return {
      aviso:
        "Cuenta creada. Confirmá el email que te enviamos y después iniciá sesión.",
    };
  }

  // Con sesión abierta se completa el perfil ya mismo. Si falla no se corta el
  // registro: el conductor igual pasa por /perfil a cargar su vehículo y ahí se
  // puede corregir.
  if (data.user) {
    const { error: errPerfil } = await supabase
      .from("profiles")
      .update({ nombre, telefono })
      .eq("id", data.user.id);
    if (errPerfil) console.error("perfil inicial falló:", errPerfil.message);
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

  if (error) {
    registrarFallo("signInWithPassword", error);
    if (esFalloDeServicio(error)) {
      return { error: ERROR_SERVICIO };
    }
    if (error.code === "email_not_confirmed") {
      return {
        error: "Confirmá el email que te enviamos antes de ingresar.",
      };
    }
    return { error: "Email o contraseña incorrectos." };
  }

  if (!data.user) {
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
  redirect("/bienvenida");
}

// Pide el link de recuperación. Nunca revela si el email existe (Supabase
// tampoco lo hace en resetPasswordForEmail): salvo fallo de servicio o
// rate-limit, siempre se devuelve el mismo aviso de éxito.
export async function pedirRecuperacion(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = formData.get("email");
  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    return { error: "Ingresá un email válido." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email);

  if (error) {
    registrarFallo("resetPasswordForEmail", error);
    if (esFalloDeServicio(error)) {
      return { error: ERROR_SERVICIO };
    }
    if (error.code === "over_email_send_rate_limit") {
      return {
        error: "Ya te enviamos un link hace poco. Esperá unos minutos e intentá de nuevo.",
      };
    }
  }

  return {
    aviso: "Si ese email tiene una cuenta, te enviamos un link para recuperar tu contraseña.",
  };
}

// Fija la contraseña nueva. Exige la sesión de recuperación que dejó
// verifyOtp al seguir el link (ver app/auth/confirmar/route.ts); sin sesión
// no hay nada que cambiar.
export async function cambiarContrasena(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const password = formData.get("password");
  if (typeof password !== "string" || password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "El link venció o no es válido. Pedí uno nuevo." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    registrarFallo("updateUser", error);
    if (esFalloDeServicio(error)) {
      return { error: ERROR_SERVICIO };
    }
    return { error: "No se pudo cambiar la contraseña. Intentá de nuevo." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (profile?.role ?? "pasajero") as UserRole;
  redirect(RUTA_POR_ROL[role]);
}
