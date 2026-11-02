"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  AttributionControl,
  Layer,
  Map,
  Marker,
  Source,
  useMap,
} from "react-map-gl/maplibre";
import { IconoAuto } from "@/components/iconos";
import type { LatLng, Place } from "@/lib/geocode";
import {
  ESTILO_MAPA,
  WORKER_MAPA,
  ZOOM_MAX_ENCUADRE,
  aLngLat,
  cajaDe,
  duracionEncuadre,
} from "@/lib/mapa";
import type { Margen, PropsMapa } from "./mapa";

// Mapa de viajes vectorial (Spec 18): MapLibre GL + OpenFreeMap. Mismas props y
// mismos marcadores (clases .marcador-* de globals.css) que mapa-leaflet.tsx.

// Alto mínimo que se le deja al mapa entre los márgenes: si el panel y los
// controles tapan casi todo, MapLibre no puede encuadrar y no mueve la cámara.
const FRANJA_MINIMA = 120;

// Encuadra el mapa: prioriza la ruta completa; si no hay, a los marcadores.
function Encuadre({
  origen,
  destino,
  ruta,
  conductor,
  margen,
  tramo,
}: {
  origen: Place | null;
  destino: Place | null;
  ruta?: LatLng[];
  conductor?: LatLng | null;
  margen: Margen;
  tramo?: string;
}) {
  const { current: map } = useMap();
  // Coordenadas primitivas: los padres recrean origen/destino en cada render, así
  // que dependemos de los números y no de la referencia del objeto (que dispararía
  // el efecto en cada render).
  const oLat = origen?.lat ?? null;
  const oLng = origen?.lng ?? null;
  const dLat = destino?.lat ?? null;
  const dLng = destino?.lng ?? null;
  const { arriba, abajo } = margen;
  // El primer encuadre no se anima: el mapa aparece ya ubicado.
  const primero = useRef(true);
  // Spec 33: último tramo cuya ruta ya se encuadró. Mientras no cambie el tramo,
  // los recálculos de la ruta no mueven la cámara.
  const tramoEncuadrado = useRef<string | null>(null);

  // Encuadre base a la ruta o a origen/destino. Sólo cuando cambian esos anclajes,
  // no en cada movimiento del conductor (que reencuadraría a cada fix).
  useEffect(() => {
    if (!map) return;
    if (tramo !== undefined && tramoEncuadrado.current === tramo) return;
    const duration = primero.current ? 0 : duracionEncuadre();
    const pts: [number, number][] = [];
    if (ruta && ruta.length > 0) {
      pts.push(...ruta.map(aLngLat));
      if (tramo !== undefined) tramoEncuadrado.current = tramo;
    } else {
      if (oLat != null && oLng != null) pts.push([oLng, oLat]);
      if (dLat != null && dLng != null) pts.push([dLng, dLat]);
    }
    if (pts.length === 0) return;
    primero.current = false;
    if (pts.length >= 2) {
      map.fitBounds(cajaDe(pts), {
        padding: relleno(map.getContainer().clientHeight, arriba, abajo),
        maxZoom: ZOOM_MAX_ENCUADRE,
        duration,
      });
    } else {
      // Centra el punto en la franja visible entre los controles y el panel.
      map.easeTo({
        center: pts[0],
        zoom: 15,
        offset: [0, (arriba - abajo) / 2],
        duration,
      });
    }
  }, [oLat, oLng, dLat, dLng, ruta, tramo, arriba, abajo, map]);

  // Mantiene visible al conductor: si su marcador queda fuera del cuadro actual,
  // reencuadra para incluir origen, destino y conductor. Mientras se mueve dentro
  // del cuadro no hace nada, así el mapa no salta a cada fix.
  useEffect(() => {
    if (!map || !conductor) return;
    const c = aLngLat(conductor);
    if (map.getBounds().contains(c)) return;
    const pts: [number, number][] = [];
    if (oLat != null && oLng != null) pts.push([oLng, oLat]);
    if (dLat != null && dLng != null) pts.push([dLng, dLat]);
    pts.push(c);
    map.fitBounds(cajaDe(pts), {
      padding: relleno(map.getContainer().clientHeight, arriba, abajo),
      maxZoom: ZOOM_MAX_ENCUADRE,
      duration: duracionEncuadre(),
    });
  }, [conductor, oLat, oLng, dLat, dLng, arriba, abajo, map]);

  return null;
}

// Relleno del encuadre. Si los márgenes no dejan una franja mínima de mapa, se
// achican en proporción para que el encuadre siga funcionando.
function relleno(alto: number, arriba: number, abajo: number) {
  const disponible = Math.max(alto - FRANJA_MINIMA, 0);
  const escala = arriba + abajo > disponible ? disponible / (arriba + abajo) : 1;
  return { top: arriba * escala, bottom: abajo * escala, left: 40, right: 40 };
}

export default function MapaVectorial({
  center,
  origen,
  destino,
  ruta,
  conductor,
  buscando = false,
  margen = { arriba: 90, abajo: 80 },
  tramo,
  alCargar,
  alFallar,
}: PropsMapa & { alCargar: () => void; alFallar: () => void }) {
  const lineaRuta = useMemo(
    () =>
      ruta && ruta.length > 0
        ? ({
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: ruta.map(aLngLat) },
          } as const)
        : null,
    [ruta],
  );

  return (
    <div className="mapa-viaje h-full w-full">
      <Map
        initialViewState={{
          longitude: center.lng,
          latitude: center.lat,
          zoom: 13,
        }}
        mapStyle={ESTILO_MAPA}
        workerUrl={WORKER_MAPA}
        style={{ width: "100%", height: "100%" }}
        attributionControl={false}
        dragRotate={false}
        pitchWithRotate={false}
        touchPitch={false}
        onLoad={alCargar}
        onError={alFallar}
      >
        <AttributionControl position="top-right" />
        {lineaRuta && (
          <Source id="ruta" type="geojson" data={lineaRuta}>
            <Layer
              id="ruta-linea"
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{
                "line-color": "#1d4ed8",
                "line-width": 6,
                "line-opacity": 0.9,
              }}
            />
          </Source>
        )}
        {buscando && origen && (
          // Onda que se expande desde el origen mientras se busca conductor.
          <Marker
            longitude={origen.lng}
            latitude={origen.lat}
            anchor="center"
            style={{ pointerEvents: "none" }}
          >
            <span className="block size-60">
              <span className="marcador-busqueda" />
            </span>
          </Marker>
        )}
        {origen && (
          <Marker longitude={origen.lng} latitude={origen.lat} anchor="center">
            <span className="marcador-origen" />
          </Marker>
        )}
        {destino && (
          <Marker longitude={destino.lng} latitude={destino.lat} anchor="center">
            <span className="marcador-destino" />
          </Marker>
        )}
        {conductor && (
          <Marker
            longitude={conductor.lng}
            latitude={conductor.lat}
            anchor="center"
          >
            <span className="marcador-conductor">
              <IconoAuto />
            </span>
          </Marker>
        )}
        <Encuadre
          origen={origen}
          destino={destino}
          ruta={ruta}
          conductor={conductor}
          margen={margen}
          tramo={tramo}
        />
      </Map>
    </div>
  );
}
