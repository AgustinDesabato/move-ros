import { NextRequest } from "next/server";
import { rutaOSRM } from "@/lib/osrm";

// GET /api/ruteo?ox=&oy=&dx=&dy=  (o = origen, d = destino; x = lng, y = lat)
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const ox = sp.get("ox");
  const oy = sp.get("oy");
  const dx = sp.get("dx");
  const dy = sp.get("dy");
  if (!ox || !oy || !dx || !dy) return Response.json(null, { status: 400 });

  const origen = { lat: Number(oy), lng: Number(ox) };
  const destino = { lat: Number(dy), lng: Number(dx) };
  if ([origen.lat, origen.lng, destino.lat, destino.lng].some(Number.isNaN)) {
    return Response.json(null, { status: 400 });
  }

  const ruta = await rutaOSRM(origen, destino);
  if (!ruta) return Response.json(null, { status: 502 });
  return Response.json(ruta);
}
