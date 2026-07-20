import { redirect } from "next/navigation";
import { cerrarSesion } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ViajarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");
  if (profile.role !== "pasajero") redirect("/conducir");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">
        Hola, sos pasajero
      </h1>
      <p className="max-w-sm text-zinc-500 dark:text-zinc-400">
        Acá vas a poder pedir tu viaje. Todavía en construcción.
      </p>
      <form action={cerrarSesion}>
        <button
          type="submit"
          className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Cerrar sesión
        </button>
      </form>
    </main>
  );
}
