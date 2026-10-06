// Configuración del mapa vectorial (Spec 18): MapLibre GL sobre OpenFreeMap.

// Estilo vectorial de OpenFreeMap: claro y sobrio, sin API key.
export const ESTILO_MAPA = "https://tiles.openfreemap.org/styles/positron";

// Worker de MapLibre servido como estático desde public/maplibre/ (lo copia
// scripts/copiar-worker-maplibre.mjs): el bundler rompe la URL que MapLibre
// deduce por defecto.
export const WORKER_MAPA = "/maplibre/maplibre-gl-worker.mjs";

// Si el mapa vectorial no terminó de cargar en este tiempo, se pasa al respaldo.
export const TIMEOUT_MAPA_MS = 8000;

// Duración de los reencuadres animados del mapa vectorial.
export const DURACION_ENCUADRE_MS = 600;

// Zoom máximo al encuadrar: dos puntos casi pegados no acercan hasta el tope.
export const ZOOM_MAX_ENCUADRE = 17;

// Duración efectiva de un reencuadre: sin animación si el usuario pidió reducir
// el movimiento.
export function duracionEncuadre(): number {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? 0
    : DURACION_ENCUADRE_MS;
}

// MapLibre usa [lng, lat]; el resto de la app (y Leaflet) usa lat/lng.
export function aLngLat(p: { lat: number; lng: number }): [number, number] {
  return [p.lng, p.lat];
}

// Caja [suroeste, noreste] que contiene a todos los puntos ([lng, lat]).
export function cajaDe(
  puntos: [number, number][],
): [[number, number], [number, number]] {
  const lngs = puntos.map((p) => p[0]);
  const lats = puntos.map((p) => p[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}
