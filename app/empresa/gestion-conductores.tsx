"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  agregarConductor,
  quitarConductor,
  getViajesConductor,
} from "@/app/actions/empresa";
import { fechaCorta } from "@/lib/formato";
import type { EmpresaConductor, ViajeConductor } from "@/lib/supabase/types";

const inputCls =
  "flex-1 rounded-lg border border-black/15 bg-transparent px-3 py-2 text-base outline-none focus:border-black dark:border-white/20 dark:focus:border-white";

// Badge de estado de un viaje cerrado (mismo criterio que el historial /viajes).
function Estado({ estado }: { estado: ViajeConductor["estado"] }) {
  const finalizada = estado === "finalizada";
  const cls = finalizada
    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
    : "bg-black/10 text-zinc-600 dark:bg-white/10 dark:text-zinc-400";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {finalizada ? "Finalizado" : "Cancelado"}
    </span>
  );
}

// Fila de un conductor: nombre, email, métricas del día y botón "Quitar".
function FilaConductor({ conductor }: { conductor: EmpresaConductor }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [viajes, setViajes] = useState<ViajeConductor[] | null>(null);
  const [cargando, startCarga] = useTransition();

  const quitar = () =>
    startTransition(async () => {
      await quitarConductor(conductor.id);
      router.refresh();
    });

  // Carga perezosa: la primera vez trae los viajes; después sólo alterna.
  const verViajes = () => {
    if (abierto) {
      setAbierto(false);
      return;
    }
    if (viajes) {
      setAbierto(true);
      return;
    }
    startCarga(async () => {
      setViajes(await getViajesConductor(conductor.id));
      setAbierto(true);
    });
  };

  return (
    <li className="rounded-2xl border border-black/10 p-4 dark:border-white/15">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{conductor.nombre ?? "Sin nombre"}</p>
          <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
            {conductor.email}
          </p>
        </div>
        <button
          type="button"
          onClick={quitar}
          disabled={pendiente}
          className="shrink-0 rounded-full border border-black/15 px-3 py-1 text-xs font-medium transition-colors hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
        >
          Quitar
        </button>
      </div>

      <p className="mt-2 border-t border-black/10 pt-2 text-xs text-zinc-500 dark:border-white/15 dark:text-zinc-400">
        {conductor.finalizadas_hoy} finalizados hoy · suma de tarifas $
        {conductor.suma_tarifas_hoy.toLocaleString("es-AR")}
      </p>

      <button
        type="button"
        onClick={verViajes}
        disabled={cargando}
        className="mt-2 text-xs font-medium text-zinc-600 underline transition-opacity hover:opacity-80 disabled:opacity-50 dark:text-zinc-300"
      >
        {cargando
          ? "Cargando…"
          : abierto
            ? "Ocultar viajes"
            : "Ver viajes"}
      </button>

      {abierto && viajes && (
        <ul className="mt-3 flex flex-col gap-2 border-t border-black/10 pt-3 dark:border-white/15">
          {viajes.length === 0 ? (
            <li className="text-xs text-zinc-500 dark:text-zinc-400">
              Sin viajes cerrados.
            </li>
          ) : (
            viajes.map((v) => (
              <li key={v.id} className="text-xs">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate font-medium">
                    {v.origen_label} → {v.destino_label}
                  </p>
                  <Estado estado={v.estado} />
                </div>
                <p className="text-zinc-500 dark:text-zinc-400">
                  {fechaCorta(v.cerrado_at ?? v.created_at)} ·{" "}
                  {(v.distancia_m / 1000).toFixed(1)} km · $
                  {v.tarifa_estimada.toLocaleString("es-AR")}
                </p>
              </li>
            ))
          )}
        </ul>
      )}
    </li>
  );
}

// Gestión de conductores de la empresa: form para agregar por email + lista con
// las métricas del día y el botón para quitar cada uno.
export default function GestionConductores({
  conductores,
}: {
  conductores: EmpresaConductor[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const agregar = () =>
    startTransition(async () => {
      setError(null);
      const res = await agregarConductor(email);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setEmail("");
      router.refresh();
    });

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="rounded-2xl border border-black/10 p-4 dark:border-white/15">
        <p className="text-sm font-medium">Agregar conductor</p>
        <div className="mt-3 flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pendiente}
            placeholder="email del conductor"
            className={inputCls}
          />
          <button
            type="button"
            onClick={agregar}
            disabled={pendiente || email.trim() === ""}
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Agregar
          </button>
        </div>
        {error && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>

      {conductores.length === 0 ? (
        <p className="mt-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Todavía no agregaste conductores.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {conductores.map((c) => (
            <FilaConductor key={c.id} conductor={c} />
          ))}
        </ul>
      )}
    </div>
  );
}
