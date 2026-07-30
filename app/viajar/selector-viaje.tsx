"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useTransition } from "react";
import BuscadorDireccion from "./buscador-direccion";
import { ROSARIO_CENTER, type LatLng, type Place } from "@/lib/geocode";
import { obtenerRuta, type Ruta } from "@/lib/ruteo";
import { calcularTarifa } from "@/lib/tarifa";
import { solicitarViaje } from "@/app/actions/viaje";
import type { MetodoPago } from "@/lib/supabase/types";

const Mapa = dynamic(() => import("./mapa"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full animate-pulse bg-black/5 dark:bg-white/5" />
  ),
});

export default function SelectorViaje() {
  const [origen, setOrigen] = useState<Place | null>(null);
  const [destino, setDestino] = useState<Place | null>(null);
  const [center, setCenter] = useState<LatLng>(ROSARIO_CENTER);
  // Guardamos el resultado junto a la "firma" del par al que pertenece, para
  // saber si sigue vigente cuando cambian origen/destino (y evitar setState
  // sincrónico dentro del efecto).
  const [res, setRes] = useState<{ sig: string; ruta: Ruta | null } | null>(
    null,
  );

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        // Permiso negado o error: se queda en ROSARIO_CENTER.
      },
    );
  }, []);

  const sig =
    origen && destino
      ? `${origen.lat},${origen.lng}|${destino.lat},${destino.lng}`
      : null;

  // Cuando hay origen y destino, pide la ruta al proxy /api/ruteo.
  useEffect(() => {
    if (!sig || !origen || !destino) return;
    let cancelado = false;
    obtenerRuta(origen, destino).then((r) => {
      if (!cancelado) setRes({ sig, ruta: r });
    });
    return () => {
      cancelado = true;
    };
  }, [sig, origen, destino]);

  const vigente = res && res.sig === sig ? res : null;
  const ruta = vigente?.ruta ?? null;
  const errorRuta = vigente !== null && vigente.ruta === null;
  const cargandoRuta = sig !== null && vigente === null;
  const tarifa = ruta ? calcularTarifa(ruta.distanciaM, ruta.duracionS) : null;

  const [metodo, setMetodo] = useState<MetodoPago>("efectivo");
  const [enviando, startEnvio] = useTransition();
  const [errorSolicitud, setErrorSolicitud] = useState<string | null>(null);

  function onSolicitar() {
    if (!origen || !destino) return;
    setErrorSolicitud(null);
    startEnvio(async () => {
      // En éxito, la action redirige a /viajar (con la solicitud pendiente).
      const res = await solicitarViaje(origen, destino, metodo);
      if (res?.error) setErrorSolicitud(res.error);
    });
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <BuscadorDireccion
        placeholder="¿Desde dónde salís?"
        onSelect={setOrigen}
        conUbicacion
      />
      <BuscadorDireccion placeholder="¿A dónde vas?" onSelect={setDestino} />
      <div className="isolate h-80 overflow-hidden rounded-2xl border border-black/10 dark:border-white/15">
        <Mapa
          center={center}
          origen={origen}
          destino={destino}
          ruta={ruta?.puntos}
        />
      </div>

      {origen && destino && (
        <div className="rounded-2xl border border-black/10 p-4 dark:border-white/15">
          {cargandoRuta && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Calculando ruta…
            </p>
          )}

          {errorRuta && (
            <p className="text-sm text-red-600 dark:text-red-400">
              No pudimos calcular la ruta. Probá de nuevo en un momento.
            </p>
          )}

          {ruta && tarifa !== null && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Distancia y tiempo
                  </p>
                  <p className="text-sm font-medium">
                    {(ruta.distanciaM / 1000).toFixed(1)} km ·{" "}
                    {Math.round(ruta.duracionS / 60)} min
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Tarifa estimada
                  </p>
                  <p className="text-lg font-semibold">
                    ${tarifa.toLocaleString("es-AR")}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  ¿Cómo pagás?
                </p>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  {(["efectivo", "digital"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMetodo(m)}
                      aria-pressed={metodo === m}
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                        metodo === m
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                      }`}
                    >
                      {m === "efectivo" ? "Efectivo" : "Digital"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {errorSolicitud && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">
              {errorSolicitud}
            </p>
          )}

          <button
            type="button"
            onClick={onSolicitar}
            disabled={cargandoRuta || errorRuta || !ruta || enviando}
            className="mt-3 w-full rounded-full bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {enviando ? "Solicitando…" : "Solicitar viaje"}
          </button>
        </div>
      )}
    </div>
  );
}
