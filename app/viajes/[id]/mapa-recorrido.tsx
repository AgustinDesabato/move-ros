"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { obtenerRuta, type Ruta } from "@/lib/ruteo";

const Mapa = dynamic(() => import("@/app/viajar/mapa"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-mapa" />,
});

// Mapa del detalle de un viaje (Spec 28): origen, destino y la ruta por calles
// entre ambos, recalculada con OSRM como en "Confirmar viaje". No es el
// trayecto real del conductor: la app no guarda la traza GPS. De la ruta sólo
// se usa la polilínea; distancia y duración son las guardadas en el viaje.
export default function MapaRecorrido({
  origenLat,
  origenLng,
  origenLabel,
  destinoLat,
  destinoLng,
  destinoLabel,
}: {
  origenLat: number;
  origenLng: number;
  origenLabel: string;
  destinoLat: number;
  destinoLng: number;
  destinoLabel: string;
}) {
  // null = todavía calculando; ruta null = OSRM no respondió.
  const [res, setRes] = useState<{ ruta: Ruta | null } | null>(null);

  useEffect(() => {
    let cancelado = false;
    obtenerRuta(
      { lat: origenLat, lng: origenLng },
      { lat: destinoLat, lng: destinoLng },
    ).then((ruta) => {
      if (!cancelado) setRes({ ruta });
    });
    return () => {
      cancelado = true;
    };
  }, [origenLat, origenLng, destinoLat, destinoLng]);

  const origen = { lat: origenLat, lng: origenLng, label: origenLabel };
  const destino = { lat: destinoLat, lng: destinoLng, label: destinoLabel };

  return (
    <div className="flex flex-col gap-2">
      <div className="h-56 overflow-hidden rounded-[20px]">
        <Mapa
          center={origen}
          origen={origen}
          destino={destino}
          ruta={res?.ruta?.puntos}
          margen={{ arriba: 30, abajo: 30 }}
        />
      </div>
      {res !== null && res.ruta === null && (
        <p role="status" className="text-[13px] text-tenue">
          No pudimos dibujar la ruta.
        </p>
      )}
    </div>
  );
}
