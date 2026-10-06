"use client";

import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { ALERTA_SVG } from "@/components/iconos";
import { fechaCorta } from "@/lib/formato";
import { ROSARIO_CENTER } from "@/lib/geocode";
import type { AlertaSoporte } from "@/lib/supabase/types";

const iconoAlerta = L.divIcon({
  className: "",
  html: `<span class="marcador-alerta">${ALERTA_SVG}</span>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

// Encuadra a todas las alertas con ubicación; una sola, centra ahí.
function Encuadre({ puntos }: { puntos: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (puntos.length === 0) return;
    if (puntos.length === 1) {
      map.setView(puntos[0], 14, { animate: false });
      return;
    }
    map.fitBounds(puntos, { paddingTopLeft: [30, 30], paddingBottomRight: [30, 30], animate: false });
  }, [puntos, map]);
  return null;
}

// Un marcador por alerta con ubicación (Spec 23); sin ubicación, no aparece
// acá (sí en la lista de la pantalla). Sin ninguna alerta ubicada, centra en
// ROSARIO_CENTER, igual que selector-viaje.tsx y panel-conductor.tsx.
export default function MapaAlertas({ alertas }: { alertas: AlertaSoporte[] }) {
  const conUbicacion = alertas.filter(
    (a): a is AlertaSoporte & { ubic_lat: number; ubic_lng: number } =>
      a.ubic_lat != null && a.ubic_lng != null,
  );
  const puntos: [number, number][] = conUbicacion.map((a) => [a.ubic_lat, a.ubic_lng]);
  const center = puntos[0] ?? [ROSARIO_CENTER.lat, ROSARIO_CENTER.lng];

  return (
    <MapContainer
      center={center}
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
      {conUbicacion.map((a) => (
        <Marker key={a.id} position={[a.ubic_lat, a.ubic_lng]} icon={iconoAlerta}>
          <Popup>
            <strong>{a.nombre_usuario ?? a.email}</strong>
            <br />
            {a.origen_label} → {a.destino_label}
            <br />
            {fechaCorta(a.created_at)}
          </Popup>
        </Marker>
      ))}
      <Encuadre puntos={puntos} />
    </MapContainer>
  );
}
