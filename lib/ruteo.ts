import type { LatLng } from "@/lib/geocode";

// Resultado del ruteo: distancia, duración y la polilínea por calles.
export type Ruta = {
  distanciaM: number; // metros
  duracionS: number; // segundos
  puntos: LatLng[]; // la polilínea, ya como { lat, lng }
};

// Consulta la ruta entre dos puntos vía el proxy /api/ruteo.
export async function obtenerRuta(
  origen: LatLng,
  destino: LatLng,
): Promise<Ruta | null> {
  const qs = `ox=${origen.lng}&oy=${origen.lat}&dx=${destino.lng}&dy=${destino.lat}`;
  try {
    const res = await fetch(`/api/ruteo?${qs}`);
    if (!res.ok) return null;
    return (await res.json()) as Ruta;
  } catch {
    return null;
  }
}
