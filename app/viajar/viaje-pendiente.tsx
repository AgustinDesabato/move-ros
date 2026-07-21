import { cancelarViaje } from "@/app/actions/viaje";
import type { Trip } from "@/lib/supabase/types";

// Vista de la solicitud activa: mientras un conductor no la tome (Spec 05),
// el pasajero ve los datos del viaje y puede cancelar.
export default function ViajePendiente({ trip }: { trip: Trip }) {
  const cancelar = cancelarViaje.bind(null, trip.id);

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="rounded-2xl border border-black/10 p-5 dark:border-white/15">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-600" />
          </span>
          <p className="text-sm font-medium">Buscando conductor…</p>
        </div>

        <dl className="mt-4 flex flex-col gap-3 text-sm">
          <div>
            <dt className="text-xs text-zinc-500 dark:text-zinc-400">Origen</dt>
            <dd className="font-medium">{trip.origen_label}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500 dark:text-zinc-400">Destino</dt>
            <dd className="font-medium">{trip.destino_label}</dd>
          </div>
          <div className="flex items-center justify-between border-t border-black/10 pt-3 dark:border-white/15">
            <span className="text-zinc-500 dark:text-zinc-400">
              {(trip.distancia_m / 1000).toFixed(1)} km ·{" "}
              {Math.round(trip.duracion_s / 60)} min
            </span>
            <span className="text-lg font-semibold">
              ${trip.tarifa_estimada.toLocaleString("es-AR")}
            </span>
          </div>
        </dl>
      </div>

      <form action={cancelar}>
        <button
          type="submit"
          className="w-full rounded-full border border-black/15 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Cancelar
        </button>
      </form>
    </div>
  );
}
