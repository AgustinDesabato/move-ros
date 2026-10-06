"use client";

import dynamic from "next/dynamic";
import type { AlertaSoporte } from "@/lib/supabase/types";
import { useMotorMapa } from "@/lib/use-motor-mapa";
import MapaAlertasVectorial from "./mapa-alertas-vectorial";

// Respaldo (Spec 18): su código sólo se descarga si el mapa vectorial no carga.
const MapaAlertasLeaflet = dynamic(() => import("./mapa-alertas-leaflet"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-mapa" />,
});

// Mapa de /soporte/alertas (Spec 23). Dibuja con MapLibre + OpenFreeMap y, si
// eso falla, con el mapa Leaflet + OpenStreetMap de siempre.
export default function MapaAlertas({ alertas }: { alertas: AlertaSoporte[] }) {
  const { motor, alCargar, alFallar } = useMotorMapa();
  if (motor === "leaflet") return <MapaAlertasLeaflet alertas={alertas} />;
  return (
    <MapaAlertasVectorial
      alertas={alertas}
      alCargar={alCargar}
      alFallar={alFallar}
    />
  );
}
