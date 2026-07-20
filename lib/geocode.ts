// Coordenada geográfica
export type LatLng = { lat: number; lng: number };

// Un lugar resuelto por el geocoder, listo para mostrar y marcar
export type Place = {
  lat: number;
  lng: number;
  label: string;
};

// Estado de la selección del viaje (en el componente, no se persiste)
export type SeleccionViaje = {
  origen: Place | null;
  destino: Place | null;
};

// Centro por defecto si falla/niega la geolocalización: Rosario centro
export const ROSARIO_CENTER: LatLng = { lat: -32.9442, lng: -60.6505 };

// Caja que acota el autocompletado al Gran Rosario (oeste,sur,este,norte)
export const ROSARIO_BBOX = {
  minLng: -60.85,
  minLat: -33.1,
  maxLng: -60.55,
  maxLat: -32.8,
};

// Busca direcciones (autocompletado) vía el proxy /api/geocode.
export async function buscarLugares(q: string): Promise<Place[]> {
  if (q.trim().length < 3) return [];
  try {
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
    if (!res.ok) return [];
    return (await res.json()) as Place[];
  } catch {
    return [];
  }
}

// Resuelve una coordenada a una dirección legible (reverse geocoding).
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<Place | null> {
  try {
    const res = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
    if (!res.ok) return null;
    const places = (await res.json()) as Place[];
    return places[0] ?? null;
  } catch {
    return null;
  }
}

export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): (...args: A) => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
