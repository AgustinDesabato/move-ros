import type { LatLng } from "@/lib/geocode";
import type { Ruta } from "@/lib/ruteo";

// Proxy a OSRM (ruteo por calles sobre OSM). User-Agent propio.
const USER_AGENT = "MoveRos/0.1 (movilidad urbana Rosario y alrededores)";

// URL base de OSRM. Se lee en cada llamada (no al cargar el módulo) para que
// cambiar OSRM_URL en .env.local tenga efecto sin reiniciar `npm run dev`.
const osrmBase = () => process.env.OSRM_URL || "https://router.project-osrm.org";

type OsrmRoute = {
  distance: number; // metros
  duration: number; // segundos
  geometry?: { coordinates: [number, number][] }; // [lng, lat][]; sin overview=false
};
type OsrmResponse = { code: string; routes?: OsrmRoute[] };

// Consulta interna compartida: devuelve routes[0] o null ante error/timeout.
// OSRM usa lng,lat; el mapeo a { lat, lng } queda en cada función pública.
async function consultarOSRM(
  origen: LatLng,
  destino: LatLng,
  query: string,
): Promise<OsrmRoute | null> {
  const coords = `${origen.lng},${origen.lat};${destino.lng},${destino.lat}`;
  const url = `${osrmBase()}/route/v1/driving/${coords}?${query}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as OsrmResponse;
    return json.routes?.[0] ?? null;
  } catch {
    return null;
  }
}

// Consulta OSRM directamente (server-side). Devuelve la ruta por calles o null
// ante error/timeout.
export async function rutaOSRM(
  origen: LatLng,
  destino: LatLng,
): Promise<Ruta | null> {
  const route = await consultarOSRM(
    origen,
    destino,
    "overview=full&geometries=geojson",
  );
  if (!route?.geometry) return null;
  return {
    distanciaM: Math.round(route.distance),
    duracionS: Math.round(route.duration),
    puntos: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
  };
}
