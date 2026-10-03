import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Ruta a la que apunta el link del mail de recuperación (ver Spec 14): verifica
// el token del lado del servidor —deja la sesión de recuperación en cookies— y
// redirige a `next` (/restablecer). Un link vencido o ya usado cae en
// /recuperar con un aviso, no en un error sin manejar.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/restablecer";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      redirect(next);
    }
  }

  redirect("/recuperar?error=link_invalido");
}
