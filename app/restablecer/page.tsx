import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BarraSuperior, Logo, enlaceCls } from "@/components/ui";
import RestablecerForm from "./restablecer-form";

// P02 · Restablecer contraseña: segundo paso del flujo, al que lleva el link
// del mail vía /auth/confirmar. Accesible sin sesión (ver
// lib/supabase/proxy.ts): si no hay sesión de recuperación (link vencido, ya
// usado, o visita directa) se muestra un aviso en vez del formulario.
export default async function RestablecerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <BarraSuperior titulo="Nueva contraseña" volverHref="/login" />

      <div className="flex flex-1 flex-col gap-5 px-6 pt-6 pb-10">
        <Logo
          className="mb-3 size-18 self-center rounded-[22px]"
          iconoClassName="size-10"
        />

        {user ? (
          <RestablecerForm />
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-[15px] text-tinta-suave">
              Este link venció o no es válido.
            </p>
            <Link href="/recuperar" className={enlaceCls}>
              Pedir un link nuevo
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
