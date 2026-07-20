"use client";

import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
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

// Encuadra el mapa a los marcadores existentes cuando cambian.
function Encuadre({
  origen,
  destino,
}: {
  origen: Place | null;
  destino: Place | null;
}) {
  const map = useMap();
  useEffect(() => {
    const pts = [origen, destino]
      .filter((p): p is Place => p !== null)
      .map((p) => [p.lat, p.lng] as [number, number]);
    if (pts.length === 2) map.fitBounds(pts, { padding: [50, 50] });
    else if (pts.length === 1) map.setView(pts[0], 15);
  }, [origen, destino, map]);
  return null;
}

export default function Mapa({
  center,
  origen,
  destino,
}: {
  center: LatLng;
  origen: Place | null;
  destino: Place | null;
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
      {origen && <Marker position={[origen.lat, origen.lng]} />}
      {destino && <Marker position={[destino.lat, destino.lng]} />}
      <Encuadre origen={origen} destino={destino} />
    </MapContainer>
  );
}
