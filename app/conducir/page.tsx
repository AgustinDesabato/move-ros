import Link from "next/link";
import { redirect } from "next/navigation";
import { cerrarSesion } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, perfilCompleto } from "@/lib/perfil";

export default async function ConducirPage() {
  const supabase = await createClient();
  const { profile, vehicle } = await getPerfil(supabase);

  if (!profile) redirect("/login");
  if (profile.role !== "conductor") redirect("/viajar");
  if (!perfilCompleto(profile, vehicle)) redirect("/perfil");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">
        Hola, {profile.nombre}
      </h1>
      <p className="max-w-sm text-zinc-500 dark:text-zinc-400">
        Sos conductor de un {vehicle?.marca} {vehicle?.modelo}. Acá vas a poder
        recibir viajes. Todavía en construcción.
      </p>
      <div className="flex items-center gap-3">
        <Link
          href="/perfil"
          className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Mi perfil
        </Link>
        <form action={cerrarSesion}>
          <button
            type="submit"
            className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </main>
  );
}
