"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fechaCorta } from "@/lib/formato";
import type { ViajeHistorial } from "@/lib/supabase/types";
import FormCalificacion from "./form-calificacion";

// Badge de estado del viaje cerrado.
function Estado({ estado }: { estado: ViajeHistorial["estado"] }) {
  const finalizada = estado === "finalizada";
  const cls = finalizada
    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
    : "bg-black/10 text-zinc-600 dark:bg-white/10 dark:text-zinc-400";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {finalizada ? "Finalizado" : "Cancelado"}
    </span>
  );
}

// Una fila del historial: origen → destino, contraparte, distancia, fecha, tarifa
// y el estado. `fallbackContraparte` es el texto cuando no hubo contraparte
// asignada ("Sin conductor" para el pasajero, "Sin pasajero" para el conductor).
// Un viaje finalizado sin calificar ofrece un botón "Calificar" (mismo
// formulario que el prompt inmediato); ya calificado muestra "Calificado".
export default function FilaViaje({
  viaje,
  fallbackContraparte,
}: {
  viaje: ViajeHistorial;
  fallbackContraparte: string;
}) {
  const router = useRouter();
  const [calificando, setCalificando] = useState(false);
  const fecha = fechaCorta(viaje.cerrado_at ?? viaje.created_at);
  const contraparte = viaje.contraparte ?? fallbackContraparte;
  const puedeCalificar = viaje.estado === "finalizada" && !viaje.ya_calificado;

  return (
    <li className="rounded-2xl border border-black/10 p-4 dark:border-white/15">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{viaje.origen_label}</p>
          <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
            → {viaje.destino_label}
          </p>
        </div>
        <Estado estado={viaje.estado} />
      </div>

      <div className="mt-3 flex items-end justify-between gap-3 border-t border-black/10 pt-3 dark:border-white/15">
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          <p className="font-medium text-zinc-700 dark:text-zinc-300">
            {contraparte}
          </p>
          <p>
            {(viaje.distancia_m / 1000).toFixed(1)} km · {fecha}
          </p>
        </div>
        <span className="text-lg font-semibold">
          ${viaje.tarifa_estimada.toLocaleString("es-AR")}
        </span>
      </div>

      {viaje.estado === "finalizada" && viaje.ya_calificado && (
        <p className="mt-3 border-t border-black/10 pt-3 text-xs text-zinc-500 dark:border-white/15 dark:text-zinc-400">
          Calificado
        </p>
      )}

      {puedeCalificar && !calificando && (
        <button
          type="button"
          onClick={() => setCalificando(true)}
          className="mt-3 w-full rounded-full border border-black/15 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Calificar
        </button>
      )}

      {puedeCalificar && calificando && (
        <div className="mt-3">
          <FormCalificacion
            tripId={viaje.id}
            contraparte={contraparte}
            onCerrar={() => setCalificando(false)}
            onListo={() => {
              setCalificando(false);
              router.refresh();
            }}
          />
        </div>
      )}
    </li>
  );
}
