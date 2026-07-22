"use client";

import { useEffect } from "react";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import type { LatLng, Place } from "@/lib/geocode";

// Fix del ícono por defecto de Leaflet (roto con bundlers).
L.Icon.Default.mergeOptions({
  iconRetinaUrl: iconRetinaUrl.src,
  iconUrl: iconUrl.src,
  shadowUrl: shadowUrl.src,
});

// Marcador del conductor: un auto, distinguible de los pines de origen/destino.
const conductorIcon = L.divIcon({
  className: "conductor-marker",
  html: '<div style="font-size:26px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))">🚗</div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

// Encuadra el mapa: prioriza la ruta completa; si no hay, a los marcadores.
function Encuadre({
  origen,
  destino,
  ruta,
  conductor,
}: {
  origen: Place | null;
  destino: Place | null;
  ruta?: LatLng[];
  conductor?: LatLng | null;
}) {
  const map = useMap();
  // Coordenadas primitivas: los padres recrean origen/destino en cada render, así
  // que dependemos de los números y no de la referencia del objeto (que dispararía
  // el efecto en cada render).
  const oLat = origen?.lat ?? null;
  const oLng = origen?.lng ?? null;
  const dLat = destino?.lat ?? null;
  const dLng = destino?.lng ?? null;

  // Encuadre base a la ruta o a origen/destino. Sólo cuando cambian esos anclajes,
  // no en cada movimiento del conductor (que reencuadraría a cada fix).
  // animate:false evita dejar un requestAnimationFrame en vuelo: si el mapa se
  // desmonta (p. ej. al finalizar el viaje) mientras una animación de pan/zoom
  // sigue corriendo, el frame siguiente toca un pane ya borrado y rompe Leaflet.
  useEffect(() => {
    if (ruta && ruta.length > 0) {
      map.fitBounds(
        ruta.map((p) => [p.lat, p.lng] as [number, number]),
        { padding: [50, 50], animate: false },
      );
      return;
    }
    const pts: [number, number][] = [];
    if (oLat != null && oLng != null) pts.push([oLat, oLng]);
    if (dLat != null && dLng != null) pts.push([dLat, dLng]);
    if (pts.length >= 2) map.fitBounds(pts, { padding: [50, 50], animate: false });
    else if (pts.length === 1) map.setView(pts[0], 15, { animate: false });
  }, [oLat, oLng, dLat, dLng, ruta, map]);

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
    map.fitBounds(pts, { padding: [50, 50], animate: false });
  }, [conductor, oLat, oLng, dLat, dLng, map]);

  return null;
}

export default function Mapa({
  center,
  origen,
  destino,
  ruta,
  conductor,
}: {
  center: LatLng;
  origen: Place | null;
  destino: Place | null;
  ruta?: LatLng[];
  conductor?: LatLng | null;
}) {
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={13}
      scrollWheelZoom
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {ruta && ruta.length > 0 && (
        <Polyline
          positions={ruta.map((p) => [p.lat, p.lng])}
          pathOptions={{ color: "#2563eb", weight: 5, opacity: 0.8 }}
        />
      )}
      {origen && <Marker position={[origen.lat, origen.lng]} />}
      {destino && <Marker position={[destino.lat, destino.lng]} />}
      {conductor && (
        <Marker
          position={[conductor.lat, conductor.lng]}
          icon={conductorIcon}
        />
      )}
      <Encuadre
        origen={origen}
        destino={destino}
        ruta={ruta}
        conductor={conductor}
      />
    </MapContainer>
  );
}
