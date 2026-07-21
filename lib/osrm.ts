import type { LatLng } from "@/lib/geocode";
import type { Ruta } from "@/lib/ruteo";

// Proxy a OSRM (ruteo por calles sobre OSM). User-Agent propio.
const OSRM = "https://router.project-osrm.org";
const USER_AGENT = "MoveRos/0.1 (movilidad urbana Rosario y alrededores)";

type OsrmRoute = {
  distance: number; // metros
  duration: number; // segundos
  geometry: { coordinates: [number, number][] }; // [lng, lat][]
};
type OsrmResponse = { code: string; routes?: OsrmRoute[] };

// Consulta OSRM directamente (server-side). Devuelve la ruta por calles o null
// ante error/timeout. OSRM usa lng,lat; acá siempre mapeamos a { lat, lng }.
export async function rutaOSRM(
  origen: LatLng,
  destino: LatLng,
): Promise<Ruta | null> {
  const coords = `${origen.lng},${origen.lat};${destino.lng},${destino.lat}`;
  const url = `${OSRM}/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as OsrmResponse;
    const route = json.routes?.[0];
    if (!route) return null;
    return {
      distanciaM: Math.round(route.distance),
      duracionS: Math.round(route.duration),
      puntos: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
    };
  } catch {
    return null;
  }
}
