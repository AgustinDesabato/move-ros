import { NextRequest } from "next/server";

// Proxy a Photon (geocoding OSM). Acota al Gran Rosario y pone User-Agent propio.
const PHOTON = "https://photon.komoot.io";
const BBOX = "-60.85,-33.10,-60.55,-32.80"; // minLon,minLat,maxLon,maxLat
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

function toPlaces(json: { features?: PhotonFeature[] }): Place[] {
  return (json.features ?? []).map((f) => ({
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
  if (lat && lng) {
    url = `${PHOTON}/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
  } else if (q && q.trim().length >= 3) {
    url = `${PHOTON}/api?q=${encodeURIComponent(q)}&bbox=${BBOX}&limit=6`;
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
    return Response.json(toPlaces(json));
  } catch {
    return Response.json([], { status: 502 });
  }
}
