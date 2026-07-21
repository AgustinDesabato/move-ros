import { NextRequest } from "next/server";

// Proxy a Photon (geocoding OSM). Acota a Rosario ciudad y pone User-Agent propio.
const PHOTON = "https://photon.komoot.io";
const BBOX = "-60.76,-33.06,-60.60,-32.85"; // minLon,minLat,maxLon,maxLat (Rosario ciudad)
const BIAS_LAT = "-32.9442"; // sesgo de ranking al centro de Rosario
const BIAS_LON = "-60.6505";
const USER_AGENT = "MoveRos/0.1 (movilidad urbana Rosario y alrededores)";

type PhotonProps = Record<string, string | undefined>;
type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: PhotonProps;
};
type Place = { lat: number; lng: number; label: string };

function buildLabel(p: PhotonProps): string {
  const calle = [p.street, p.housenumber].filter(Boolean).join(" ");
  const parts: string[] = [];
  if (p.name) parts.push(p.name);
  if (calle && calle !== p.name) parts.push(calle);
  const ciudad = p.city ?? p.district;
  if (ciudad) parts.push(ciudad);
  return parts.join(", ") || p.state || p.country || "Ubicación";
}

// Deja pasar sólo lo de Rosario ciudad (los que no declaran city se aceptan:
// ya vienen acotados por el bbox).
function esRosario(p: PhotonProps): boolean {
  return !p.city || p.city === "Rosario";
}

function toPlaces(
  json: { features?: PhotonFeature[] },
  soloRosario: boolean,
): Place[] {
  return (json.features ?? [])
    .filter((f) => !soloRosario || esRosario(f.properties))
    .slice(0, 6)
    .map((f) => ({
      lng: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
      label: buildLabel(f.properties),
    }));
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const q = sp.get("q");
  const lat = sp.get("lat");
  const lng = sp.get("lng");

  let url: string;
  let soloRosario: boolean;
  if (lat && lng) {
    // Reverse (ubicación real del usuario): no se filtra a Rosario.
    url = `${PHOTON}/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
    soloRosario = false;
  } else if (q && q.trim().length >= 3) {
    // Forward: acota por bbox, sesga el ranking al centro de Rosario y filtra a Rosario ciudad.
    url = `${PHOTON}/api?q=${encodeURIComponent(q)}&bbox=${BBOX}&lat=${BIAS_LAT}&lon=${BIAS_LON}&limit=10`;
    soloRosario = true;
  } else {
    return Response.json([]);
  }

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return Response.json([], { status: 502 });
    const json = await res.json();
    return Response.json(toPlaces(json, soloRosario));
  } catch {
    return Response.json([], { status: 502 });
  }
}
