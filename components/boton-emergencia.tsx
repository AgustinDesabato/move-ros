"use client";

import { registrarAlerta } from "@/app/actions/seguridad";
import { IconoAlerta } from "./iconos";

// Registra la alerta de emergencia con la mejor ubicación disponible, sin
// bloquear ni demorar la llamada al 911 en paralelo (el <a href="tel:911">
// navega igual aunque esto falle o tarde). Sin fix de GPS a tiempo, se
// registra igual, sin coordenadas.
function emergencia(tripId: string) {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    registrarAlerta(tripId, null);
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      registrarAlerta(tripId, {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      });
    },
    () => registrarAlerta(tripId, null),
    { timeout: 4000 },
  );
}

// Enlace "Emergencia · llamar al 911" del viaje en curso: P07 del pasajero
// (Spec 12) y la tarjeta de viaje del conductor (Spec 31).
export default function BotonEmergencia({ tripId }: { tripId: string }) {
  return (
    <a
      href="tel:911"
      onClick={() => emergencia(tripId)}
      className="flex h-13 items-center justify-center gap-2 rounded-2xl border-2 border-peligro bg-peligro-suave text-base font-bold tracking-[0.02em] text-peligro transition-colors hover:bg-peligro hover:text-white"
    >
      <IconoAlerta />
      Emergencia · llamar al 911
    </a>
  );
}
