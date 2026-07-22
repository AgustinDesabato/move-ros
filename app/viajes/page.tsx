import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfil } from "@/lib/perfil";
import type { ViajeHistorial } from "@/lib/supabase/types";
import FilaViaje from "./fila-viaje";

const btnCls =
  "rounded-full border border-black/15 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10";

export default async function ViajesPage() {
  const supabase = await createClient();
  const { profile } = await getPerfil(supabase);

  if (!profile) redirect("/login");

  // La RPC resuelve rol, filtro (finalizada/cancelada), orden, límite y el nombre
  // de la contraparte del lado del servidor. La vista sólo la renderiza.
  const { data } = await supabase.rpc("historial_viajes");
  const viajes = (data as ViajeHistorial[] | null) ?? [];

  const esConductor = profile.role === "conductor";
  const volverHref = esConductor ? "/conducir" : "/viajar";
  const fallbackContraparte = esConductor ? "Sin pasajero" : "Sin conductor";

  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-6 py-10">
      <header className="flex w-full max-w-md items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mis viajes</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Tus viajes finalizados y cancelados
          </p>
        </div>
        <Link href={volverHref} className={btnCls}>
          Volver
        </Link>
      </header>

      {viajes.length === 0 ? (
        <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-400">
          Todavía no tenés viajes.
        </p>
      ) : (
        <ul className="flex w-full max-w-md flex-col gap-3">
          {viajes.map((viaje) => (
            <FilaViaje
              key={viaje.id}
              viaje={viaje}
              fallbackContraparte={fallbackContraparte}
            />
          ))}
        </ul>
      )}
    </main>
  );
}
