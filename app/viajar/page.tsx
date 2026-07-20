import Link from "next/link";
import { redirect } from "next/navigation";
import { cerrarSesion } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, perfilCompleto } from "@/lib/perfil";
import SelectorViaje from "./selector-viaje";

const btnCls =
  "rounded-full border border-black/15 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10";

export default async function ViajarPage() {
  const supabase = await createClient();
  const { profile, vehicle } = await getPerfil(supabase);

  if (!profile) redirect("/login");
  if (profile.role !== "pasajero") redirect("/conducir");
  if (!perfilCompleto(profile, vehicle)) redirect("/perfil");

  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-6 py-10">
      <header className="flex w-full max-w-md items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Hola, {profile.nombre}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            ¿A dónde vamos?
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/perfil" className={btnCls}>
            Mi perfil
          </Link>
          <form action={cerrarSesion}>
            <button type="submit" className={btnCls}>
              Salir
            </button>
          </form>
        </div>
      </header>

      <SelectorViaje />
    </main>
  );
}
