import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfil } from "@/lib/perfil";
import type { ViajeHistorial } from "@/lib/supabase/types";
import { BarraSuperior } from "@/components/ui";
import FilaViaje from "./fila-viaje";

export default async function ViajesPage() {
  const supabase = await createClient();
  const { profile } = await getPerfil(supabase);

  if (!profile) redirect("/login");

  // La RPC resuelve rol, filtro (finalizada/cancelada), orden, límite y el nombre
  // de la contraparte del lado del servidor. La vista sólo la renderiza.
  const { data } = await supabase.rpc("historial_viajes");
  const viajes = (data as ViajeHistorial[] | null) ?? [];

  const esConductor = profile.role === "conductor";
  const fallbackContraparte = esConductor ? "Sin pasajero" : "Sin conductor";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <BarraSuperior titulo="Historial de viajes" volverHref="/perfil" />

      <div className="flex flex-1 flex-col gap-3 px-5 pt-2 pb-8">
        <p className="text-[15px] text-tenue">Tus viajes finalizados y cancelados</p>
        {viajes.length === 0 ? (
          <p className="mt-6 rounded-[20px] bg-white px-4 py-8 text-center text-sm text-tenue">
            Todavía no tenés viajes.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {viajes.map((viaje) => (
              <FilaViaje
                key={viaje.id}
                viaje={viaje}
                fallbackContraparte={fallbackContraparte}
                esConductor={esConductor}
              />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
