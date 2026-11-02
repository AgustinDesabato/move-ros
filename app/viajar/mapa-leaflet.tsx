"use client";

import { useEffect, useRef } from "react";
import {
  AttributionControl,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { AUTO_SVG } from "@/components/iconos";
import type { LatLng, Place } from "@/lib/geocode";
import type { Margen, PropsMapa } from "./mapa";

// Respaldo del mapa de viajes (Spec 18): Leaflet + teselas PNG de OpenStreetMap.
// Se monta sólo si el mapa vectorial (mapa-vectorial.tsx) no puede cargar.

// Marcadores propios (divIcons estilados en globals.css): círculo = origen,
// cuadrado = destino, como en el resto de la interfaz.
const iconoOrigen = L.divIcon({
  className: "",
  html: '<span class="marcador-origen"></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const iconoDestino = L.divIcon({
  className: "",
  html: '<span class="marcador-destino"></span>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const iconoConductor = L.divIcon({
  className: "",
  html: `<span class="marcador-conductor">${AUTO_SVG}</span>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

// Onda que se expande desde el origen mientras se busca conductor.
const iconoBusqueda = L.divIcon({
  className: "",
  html: '<span class="marcador-busqueda"></span>',
  iconSize: [240, 240],
  iconAnchor: [120, 120],
});

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
  const map = useMap();
  // Coordenadas primitivas: los padres recrean origen/destino en cada render, así
  // que dependemos de los números y no de la referencia del objeto (que dispararía
  // el efecto en cada render).
  const oLat = origen?.lat ?? null;
  const oLng = origen?.lng ?? null;
  const dLat = destino?.lat ?? null;
  const dLng = destino?.lng ?? null;
  const { arriba, abajo } = margen;
  // Spec 33: último tramo cuya ruta ya se encuadró. Mientras no cambie el tramo,
  // los recálculos de la ruta no mueven la cámara.
  const tramoEncuadrado = useRef<string | null>(null);

  // Encuadre base a la ruta o a origen/destino. Sólo cuando cambian esos anclajes,
  // no en cada movimiento del conductor (que reencuadraría a cada fix).
  // animate:false evita dejar un requestAnimationFrame en vuelo: si el mapa se
  // desmonta (p. ej. al finalizar el viaje) mientras una animación de pan/zoom
  // sigue corriendo, el frame siguiente toca un pane ya borrado y rompe Leaflet.
  useEffect(() => {
    if (tramo !== undefined && tramoEncuadrado.current === tramo) return;
    const opciones = {
      paddingTopLeft: [40, arriba] as [number, number],
      paddingBottomRight: [40, abajo] as [number, number],
      animate: false,
    };
    if (ruta && ruta.length > 0) {
      map.fitBounds(
        ruta.map((p) => [p.lat, p.lng] as [number, number]),
        opciones,
      );
      if (tramo !== undefined) tramoEncuadrado.current = tramo;
      return;
    }
    const pts: [number, number][] = [];
    if (oLat != null && oLng != null) pts.push([oLat, oLng]);
    if (dLat != null && dLng != null) pts.push([dLat, dLng]);
    if (pts.length >= 2) {
      map.fitBounds(pts, opciones);
    } else if (pts.length === 1) {
      // Centra el punto en la franja visible entre los controles y el panel.
      map.setView(pts[0], 15, { animate: false });
      map.panBy([0, (abajo - arriba) / 2], { animate: false });
    }
  }, [oLat, oLng, dLat, dLng, ruta, tramo, arriba, abajo, map]);

  // Mantiene visible al conductor: si su marcador queda fuera del cuadro actual,
  // reencuadra para incluir origen, destino y conductor. Mientras se mueve dentro
  // del cuadro no hace nada, así el mapa no salta a cada fix.
  useEffect(() => {
    if (!conductor) return;
    const c: [number, number] = [conductor.lat, conductor.lng];
    if (map.getBounds().contains(c)) return;
    const pts: [number, number][] = [];
    if (oLat != null && oLng != null) pts.push([oLat, oLng]);
    if (dLat != null && dLng != null) pts.push([dLat, dLng]);
    pts.push(c);
    map.fitBounds(pts, {
      paddingTopLeft: [40, arriba],
      paddingBottomRight: [40, abajo],
      animate: false,
    });
  }, [conductor, oLat, oLng, dLat, dLng, arriba, abajo, map]);

  return null;
}

export default function MapaLeaflet({
  center,
  origen,
  destino,
  ruta,
  conductor,
  buscando = false,
  margen = { arriba: 90, abajo: 80 },
  tramo,
}: PropsMapa) {
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={13}
      scrollWheelZoom
      zoomControl={false}
      attributionControl={false}
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <AttributionControl position="topright" prefix={false} />
      {ruta && ruta.length > 0 && (
        <Polyline
          positions={ruta.map((p) => [p.lat, p.lng])}
          pathOptions={{ color: "#1d4ed8", weight: 6, opacity: 0.9 }}
        />
      )}
      {buscando && origen && (
        <Marker
          position={[origen.lat, origen.lng]}
          icon={iconoBusqueda}
          interactive={false}
        />
      )}
      {origen && (
        <Marker position={[origen.lat, origen.lng]} icon={iconoOrigen} />
      )}
      {destino && (
        <Marker position={[destino.lat, destino.lng]} icon={iconoDestino} />
      )}
      {conductor && (
        <Marker
          position={[conductor.lat, conductor.lng]}
          icon={iconoConductor}
        />
      )}
      <Encuadre
        origen={origen}
        destino={destino}
        ruta={ruta}
        conductor={conductor}
        margen={margen}
        tramo={tramo}
      />
    </MapContainer>
  );
}
