"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  estadoViajeActivo,
  cancelarViaje,
  type EstadoViaje,
} from "@/app/actions/viaje";
import { POLL_MS } from "@/lib/despacho";
import type { Trip, ConductorPublico } from "@/lib/supabase/types";

const outlineCls =
  "w-full rounded-full border border-black/15 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10";

function DatosViaje({ trip }: { trip: Trip }) {
  return (
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
  );
}

function Conductor({ conductor }: { conductor: ConductorPublico }) {
  return (
    <div className="mt-4 rounded-xl bg-black/5 p-3 text-sm dark:bg-white/10">
      <p className="font-medium">{conductor.nombre ?? "Tu conductor"}</p>
      <p className="text-zinc-500 dark:text-zinc-400">
        {conductor.marca} {conductor.modelo} · {conductor.color} ·{" "}
        <span className="font-medium tracking-wide">{conductor.patente}</span>
      </p>
    </div>
  );
}

export default function ViajePendiente({ initialTrip }: { initialTrip: Trip }) {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoViaje>({
    trip: initialTrip,
    conductor: null,
  });
  const [pendiente, startTransition] = useTransition();

  const tick = useCallback(async () => {
    const e = await estadoViajeActivo(initialTrip.id);
    if (!e) {
      // El viaje ya no está activo (p. ej. cancelado): volvé a la vista base.
      router.refresh();
      return;
    }
    setEstado(e);
  }, [router, initialTrip.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [tick]);

  if (!estado) return null;
  const { trip, conductor } = estado;

  const cancelar = () =>
    startTransition(async () => {
      await cancelarViaje(trip.id);
      router.refresh();
    });

  const volver = () => router.refresh();

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="rounded-2xl border border-black/10 p-5 dark:border-white/15">
        {trip.estado === "pendiente" && (
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-600" />
            </span>
            <p className="text-sm font-medium">Buscando conductor…</p>
          </div>
        )}
        {trip.estado === "aceptada" && (
          <p className="text-sm font-medium">Tu conductor está en camino</p>
        )}
        {trip.estado === "en_curso" && (
          <p className="text-sm font-medium">Viaje en curso</p>
        )}
        {trip.estado === "finalizada" && (
          <p className="text-sm font-medium">Viaje finalizado</p>
        )}

        <DatosViaje trip={trip} />

        {(trip.estado === "aceptada" || trip.estado === "en_curso") &&
          conductor && <Conductor conductor={conductor} />}
      </div>

      {(trip.estado === "pendiente" || trip.estado === "aceptada") && (
        <button
          type="button"
          disabled={pendiente}
          onClick={cancelar}
          className={outlineCls}
        >
          Cancelar
        </button>
      )}

      {trip.estado === "finalizada" && (
        <button type="button" onClick={volver} className={outlineCls}>
          Volver
        </button>
      )}
    </div>
  );
}
