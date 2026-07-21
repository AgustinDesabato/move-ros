"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  heartbeat,
  ofertaActual,
  viajeAsignado,
  aceptarOferta,
  rechazarOferta,
  iniciarViaje,
  finalizarViaje,
  bajarseViaje,
  type OfertaActiva,
} from "@/app/actions/conductor";
import { POLL_MS } from "@/lib/despacho";
import type { Trip } from "@/lib/supabase/types";

const primaryCls =
  "w-full rounded-full bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50";
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

export default function PanelConductor() {
  const [oferta, setOferta] = useState<OfertaActiva | null>(null);
  const [viaje, setViaje] = useState<Trip | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ahora, setAhora] = useState(() => Date.now());
  const [pendiente, startTransition] = useTransition();

  // Un ciclo de poll: heartbeat + oferta actual + viaje asignado.
  const tick = useCallback(async () => {
    await heartbeat();
    const [o, v] = await Promise.all([ofertaActual(), viajeAsignado()]);
    setOferta(o);
    setViaje(v);
    setCargando(false);
  }, []);

  useEffect(() => {
    // tick() es asíncrono: los setState ocurren tras los await, no hay cascada
    // síncrona. Es el poll inmediato del patrón poll-al-montar + intervalo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [tick]);

  // Reloj de 1s para la cuenta regresiva de la oferta.
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const correr = (accion: () => Promise<void>) =>
    startTransition(async () => {
      await accion();
      await tick();
    });

  if (cargando) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Cargando…</p>
    );
  }

  // Viaje asignado (aceptada / en_curso): tiene prioridad sobre cualquier oferta.
  if (viaje) {
    const enCurso = viaje.estado === "en_curso";
    return (
      <div className="flex w-full max-w-md flex-col gap-4">
        <div className="rounded-2xl border border-black/10 p-5 dark:border-white/15">
          <p className="text-sm font-medium">
            {enCurso ? "Viaje en curso" : "Viaje aceptado"}
          </p>
          <DatosViaje trip={viaje} />
        </div>

        {enCurso ? (
          <button
            type="button"
            disabled={pendiente}
            onClick={() => correr(() => finalizarViaje(viaje.id))}
            className={primaryCls}
          >
            Finalizar viaje
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={pendiente}
              onClick={() => correr(() => iniciarViaje(viaje.id))}
              className={primaryCls}
            >
              Iniciar viaje
            </button>
            <button
              type="button"
              disabled={pendiente}
              onClick={() => correr(() => bajarseViaje(viaje.id))}
              className={outlineCls}
            >
              Bajarme
            </button>
          </>
        )}
      </div>
    );
  }

  // Oferta entrante.
  if (oferta) {
    const restante = Math.max(
      0,
      Math.ceil((new Date(oferta.expira_at).getTime() - ahora) / 1000),
    );
    return (
      <div className="flex w-full max-w-md flex-col gap-4">
        <div className="rounded-2xl border border-blue-500/40 bg-blue-500/5 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Nuevo viaje para vos</p>
            <span className="text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
              {restante}s
            </span>
          </div>
          <DatosViaje trip={oferta.trip} />
        </div>

        <button
          type="button"
          disabled={pendiente || restante === 0}
          onClick={() => correr(() => aceptarOferta(oferta.trip.id))}
          className={primaryCls}
        >
          Aceptar
        </button>
        <button
          type="button"
          disabled={pendiente}
          onClick={() => correr(() => rechazarOferta(oferta.trip.id))}
          className={outlineCls}
        >
          Rechazar
        </button>
      </div>
    );
  }

  // Sin oferta ni viaje asignado.
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-2 rounded-2xl border border-black/10 p-8 text-center dark:border-white/15">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
      </span>
      <p className="text-sm font-medium">Esperando viajes…</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Mantené esta pantalla abierta para recibir ofertas.
      </p>
    </div>
  );
}
