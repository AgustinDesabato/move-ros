"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Map, Marker, Popup, useMap } from "react-map-gl/maplibre";
import { IconoAlerta } from "@/components/iconos";
import { fechaCorta } from "@/lib/formato";
import { ROSARIO_CENTER } from "@/lib/geocode";
import {
  ESTILO_MAPA,
  WORKER_MAPA,
  ZOOM_MAX_ENCUADRE,
  cajaDe,
  duracionEncuadre,
} from "@/lib/mapa";
import type { AlertaSoporte } from "@/lib/supabase/types";

type AlertaUbicada = AlertaSoporte & { ubic_lat: number; ubic_lng: number };

// Encuadra a todas las alertas con ubicación; una sola, centra ahí.
function Encuadre({ puntos }: { puntos: [number, number][] }) {
  const { current: map } = useMap();
  // El primer encuadre no se anima: el mapa aparece ya ubicado.
  const primero = useRef(true);
  useEffect(() => {
    if (!map || puntos.length === 0) return;
    const duration = primero.current ? 0 : duracionEncuadre();
    primero.current = false;
    if (puntos.length === 1) {
      map.easeTo({ center: puntos[0], zoom: 14, duration });
      return;
    }
    map.fitBounds(cajaDe(puntos), {
      padding: 30,
      maxZoom: ZOOM_MAX_ENCUADRE,
      duration,
    });
  }, [puntos, map]);
  return null;
}

// Mapa de alertas vectorial (Spec 18): MapLibre GL + OpenFreeMap. Un marcador
// por alerta con ubicación (Spec 23); sin ubicación, no aparece acá (sí en la
// lista de la pantalla). Sin ninguna alerta ubicada, centra en ROSARIO_CENTER.
export default function MapaAlertasVectorial({
  alertas,
  alCargar,
  alFallar,
}: {
  alertas: AlertaSoporte[];
  alCargar: () => void;
  alFallar: () => void;
}) {
  const conUbicacion = useMemo(
    () =>
      alertas.filter(
        (a): a is AlertaUbicada => a.ubic_lat != null && a.ubic_lng != null,
      ),
    [alertas],
  );
  // [lng, lat], el orden de MapLibre.
  const puntos = useMemo(
    () => conUbicacion.map((a): [number, number] => [a.ubic_lng, a.ubic_lat]),
    [conUbicacion],
  );
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null);
  const seleccionada = conUbicacion.find((a) => a.id === seleccionadaId);
  const [lng, lat] = puntos[0] ?? [ROSARIO_CENTER.lng, ROSARIO_CENTER.lat];

  return (
    <Map
      initialViewState={{ longitude: lng, latitude: lat, zoom: 13 }}
      mapStyle={ESTILO_MAPA}
      workerUrl={WORKER_MAPA}
      style={{ width: "100%", height: "100%" }}
      dragRotate={false}
      pitchWithRotate={false}
      touchPitch={false}
      onLoad={alCargar}
      onError={alFallar}
    >
      {conUbicacion.map((a) => (
        <Marker
          key={a.id}
          longitude={a.ubic_lng}
          latitude={a.ubic_lat}
          anchor="center"
          onClick={(e) => {
            // Que el clic no llegue al mapa: cerraría el popup recién abierto.
            e.originalEvent.stopPropagation();
            setSeleccionadaId(a.id);
          }}
        >
          <span className="marcador-alerta cursor-pointer">
            <IconoAlerta className="size-[18px]" />
          </span>
        </Marker>
      ))}
      {seleccionada && (
        <Popup
          longitude={seleccionada.ubic_lng}
          latitude={seleccionada.ubic_lat}
          anchor="bottom"
          offset={22}
          onClose={() => setSeleccionadaId(null)}
        >
          <strong>{seleccionada.nombre_usuario ?? seleccionada.email}</strong>
          <br />
          {seleccionada.origen_label} → {seleccionada.destino_label}
          <br />
          {fechaCorta(seleccionada.created_at)}
        </Popup>
      )}
      <Encuadre puntos={puntos} />
    </Map>
  );
}
