"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import BuscadorDireccion from "./buscador-direccion";
import { ROSARIO_CENTER, type LatLng, type Place } from "@/lib/geocode";

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

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <BuscadorDireccion
        placeholder="¿Desde dónde salís?"
        onSelect={setOrigen}
        conUbicacion
      />
      <BuscadorDireccion placeholder="¿A dónde vas?" onSelect={setDestino} />
      <div className="h-80 overflow-hidden rounded-2xl border border-black/10 dark:border-white/15">
        <Mapa center={center} origen={origen} destino={destino} />
      </div>
    </div>
  );
}
