"use client";

import dynamic from "next/dynamic";
import type { LatLng, Place } from "@/lib/geocode";
import { useMotorMapa } from "@/lib/use-motor-mapa";
import MapaVectorial from "./mapa-vectorial";

// Espacio que tapan los controles flotantes (arriba) y el panel (abajo), para
// que el encuadre deje la ruta en la parte visible del mapa.
export type Margen = { arriba: number; abajo: number };

export type PropsMapa = {
  center: LatLng;
  origen: Place | null;
  destino: Place | null;
  ruta?: LatLng[];
  conductor?: LatLng | null;
  buscando?: boolean;
  margen?: Margen;
  // Spec 33: si llega, la ruta se encuadra sólo la primera vez que aparece para
  // este tramo; los recálculos del mismo tramo no mueven la cámara.
  tramo?: string;
};

// Respaldo (Spec 18): su código sólo se descarga si el mapa vectorial no carga.
const MapaLeaflet = dynamic(() => import("./mapa-leaflet"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-mapa" />,
});

// Mapa de las pantallas de viaje. Dibuja con MapLibre + OpenFreeMap y, si eso
// falla, con el mapa Leaflet + OpenStreetMap de siempre.
export default function Mapa(props: PropsMapa) {
  const { motor, alCargar, alFallar } = useMotorMapa();
  if (motor === "leaflet") return <MapaLeaflet {...props} />;
  return <MapaVectorial {...props} alCargar={alCargar} alFallar={alFallar} />;
}
