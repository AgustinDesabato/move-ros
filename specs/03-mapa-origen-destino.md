# SPEC 03 — Mapa y selección de origen/destino

> **Estado:** Implementado
> **Depende de:** SPEC 01, SPEC 02
> **Fecha:** 2026-07-20
> **Objetivo:** Mostrar al pasajero, en `/viajar`, un mapa donde elige origen y destino por autocompletado de direcciones (Leaflet + OpenStreetMap, geocoding con Photon), con su ubicación actual como origen propuesto.

Este spec construye sobre el gate de perfil del Spec 02: el mapa se renderiza sólo para un pasajero con perfil completo. Es la base visual sobre la que el Spec 04 montará la solicitud de viaje y la estimación de tarifa.

## Alcance

**Incluye:**

- Sumar dependencias: `leaflet`, `react-leaflet`, `@types/leaflet`, y el CSS de Leaflet.
- Route Handler `app/api/geocode/route.ts` que proxya a Photon (`photon.komoot.io`), acotando resultados a Rosario y alrededores (`bbox`), con `User-Agent` propio.
- Helper cliente `lib/geocode.ts` que consulta `/api/geocode?q=...` con debounce y devuelve una lista de lugares.
- Componente de mapa (client component, cargado con `dynamic(..., { ssr: false })`) que muestra tiles de OpenStreetMap y los marcadores de origen y destino, y encuadra la vista a ambos.
- Componente de selección con dos campos (origen y destino), cada uno con autocompletado de direcciones y su dropdown de sugerencias.
- Botón "Usar mi ubicación actual" para fijar el origen vía Geolocation API del navegador.
- Geolocalización al abrir: centra el mapa en la ubicación actual; si el permiso se niega o falla, cae a un centro por defecto (Rosario centro).
- Integración en `app/viajar/page.tsx`: el mapa y el selector reemplazan el placeholder actual, manteniendo el gate de perfil y el link a `/perfil` / logout.
- Estado de origen/destino sólo en el cliente (no se persiste nada).

**Fuera de alcance (para specs futuros):**

- Persistir la selección o crear una "solicitud de viaje" en Supabase (Spec 04).
- Dibujar la ruta entre origen y destino y calcular distancia/tiempo/tarifa (Spec 04).
- Matching o despacho a conductores (Spec 05).
- Elegir puntos arrastrando/tocando pines en el mapa (por ahora sólo autocompletado de direcciones).
- Direcciones guardadas / favoritas / historial de lugares.
- Que el conductor vea el mapa (este spec es sólo la vista del pasajero).
- Autocompletado fuera de Rosario y alrededores.

## Modelo de datos

Este spec **no introduce estructuras persistentes** (no toca Supabase ni la base). Todo vive en estado de cliente. Las estructuras son tipos TypeScript nuevos en `lib/geocode.ts`:

```ts
// Coordenada geográfica
export type LatLng = { lat: number; lng: number };

// Un lugar resuelto por el geocoder, listo para mostrar y marcar
export type Place = {
  lat: number;
  lng: number;
  label: string; // dirección legible (ej. "San Martín 1234, Rosario")
};

// Estado de la selección del viaje (en el componente, no se persiste)
export type SeleccionViaje = {
  origen: Place | null;
  destino: Place | null;
};
```

Respuesta de Photon: es un `FeatureCollection` GeoJSON; cada `feature` trae `geometry.coordinates = [lng, lat]` y `properties` (`name`, `street`, `housenumber`, `city`, …). El proxy/helper la mapea a `Place[]`, construyendo `label` a partir de esas propiedades.

Constantes (en `lib/geocode.ts`):

```ts
// Centro por defecto si falla/niega la geolocalización: Rosario centro
export const ROSARIO_CENTER: LatLng = { lat: -32.9442, lng: -60.6505 };

// Caja que acota el autocompletado al Gran Rosario (oeste,sur,este,norte)
export const ROSARIO_BBOX = {
  minLng: -60.85,
  minLat: -33.10,
  maxLng: -60.55,
  maxLat: -32.80,
};
```

**Convenciones:**

- Photon devuelve las coordenadas como `[lng, lat]` (GeoJSON); en la app siempre usamos `{ lat, lng }`. El mapeo se hace en un solo lugar (el helper) para no confundir el orden.
- `label` es la dirección ya formateada; los componentes nunca arman la etiqueta a mano.

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Dependencias + CSS de Leaflet.** `npm install leaflet react-leaflet @types/leaflet`. Importar el CSS de Leaflet (`leaflet/dist/leaflet.css`) en `app/globals.css`. Verificación: `npm run build` compila y `npm run lint` pasa.

2. **Route Handler `app/api/geocode/route.ts`.** `GET` que acepta `?q=<texto>` (forward) o `?lat=&lng=` (reverse). Llama a Photon (`/api?q=...&bbox=...&lang=es` o `/reverse?lat=&lon=`) con `User-Agent` propio, mapea el `FeatureCollection` a `Place[]` y lo devuelve como JSON. Verificación: `curl "localhost:3000/api/geocode?q=san martin"` devuelve una lista de lugares del Gran Rosario.

3. **Helper `lib/geocode.ts`.** Tipos (`LatLng`, `Place`, `SeleccionViaje`), constantes (`ROSARIO_CENTER`, `ROSARIO_BBOX`), y funciones `buscarLugares(q)` y `reverseGeocode(lat, lng)` que consultan `/api/geocode`, más un pequeño `debounce`. Verificación: `npm run lint` pasa.

4. **Componente de mapa.** `app/viajar/mapa.tsx` (client component) con `react-leaflet`: `MapContainer` + `TileLayer` de OpenStreetMap, marcadores opcionales de `origen`/`destino`, y encuadre a ambos cuando existen. Configurar el ícono por defecto de Leaflet (evita el marcador roto con bundler). Se carga en `/viajar` con `dynamic(() => import("./mapa"), { ssr: false })`. Verificación: `/viajar` muestra el mapa de Rosario con tiles.

5. **Componente de autocompletado.** `app/viajar/buscador-direccion.tsx` (client): input con `buscarLugares` debounced, dropdown de sugerencias, y `onSelect(place)`. Incluye el botón "Usar mi ubicación actual" que usa la Geolocation API y `reverseGeocode` para fijar el origen con etiqueta. Verificación: al tipear aparecen sugerencias; al elegir una, se dispara `onSelect`.

6. **Integración en `/viajar`.** `app/viajar/selector-viaje.tsx` (client) mantiene el estado `SeleccionViaje`, renderiza dos `BuscadorDireccion` (origen/destino) y el mapa con los marcadores; al montar, pide geolocalización para centrar el mapa (fallback a `ROSARIO_CENTER`). `app/viajar/page.tsx` reemplaza el placeholder por este selector, conservando el gate de perfil, el saludo, el link a `/perfil` y el logout. Verificación: en `/viajar`, un pasajero elige origen y destino y ve ambos marcadores encuadrados en el mapa.

## Criterios de aceptación

- [ ] `GET /api/geocode?q=san martin` devuelve una lista JSON de lugares con `lat`, `lng` y `label`, acotada al Gran Rosario.
- [ ] `GET /api/geocode?lat=-32.9442&lng=-60.6505` (reverse) devuelve un `label` de dirección legible para esas coordenadas.
- [ ] En `/viajar`, un pasajero con perfil completo ve un mapa con tiles de OpenStreetMap centrado en Rosario.
- [ ] Al abrir `/viajar`, si el usuario concede el permiso de ubicación, el mapa se centra en su posición; si lo niega o falla, se centra en Rosario centro y la app no rompe.
- [ ] Escribir en el campo de origen o destino muestra un dropdown de sugerencias de direcciones tras un breve debounce.
- [ ] Elegir una sugerencia coloca su marcador en el mapa (origen y destino con sus respectivos marcadores).
- [ ] Con origen y destino elegidos, el mapa encuadra la vista para que ambos marcadores sean visibles.
- [ ] El botón "Usar mi ubicación actual" fija el origen con las coordenadas del navegador y muestra una dirección legible (reverse geocoding).
- [ ] La selección no se persiste: recargar `/viajar` empieza con origen y destino vacíos.
- [ ] El gate del Spec 02 se mantiene: un pasajero con perfil incompleto que entra a `/viajar` sigue siendo redirigido a `/perfil`, y la guarda por rol (conductor → `/conducir`) sigue vigente.
- [ ] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** Leaflet + OpenStreetMap + Photon. Sin API key ni billing; costo cero para el MVP.
- **No:** Google Maps / Mapbox. Exigen key o tarjeta; reconsiderables si hiciera falta mejor calidad de datos.
- **Sí:** proxy `/api/geocode`. Controla `User-Agent`, permite cacheo y evita CORS y el límite por IP del cliente.
- **Sí:** Photon para el autocompletado. Está pensado para typeahead y su política es amigable (Nominatim lo desaconseja).
- **Sí:** selección sólo por autocompletado de direcciones. **No:** elegir con pines arrastrables (spec futuro).
- **Sí:** sin persistencia; estado de cliente. La solicitud de viaje va al Spec 04.
- **Sí:** reverse geocoding en "Usar mi ubicación" para mostrar una dirección legible.
- **Sí:** `react-leaflet` con `dynamic(..., { ssr: false })` porque Leaflet toca `window`.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El Photon público puede rate-limitear o caerse → el autocompletado no responde | Manejar timeout/error mostrando "sin resultados"; el mapa y el resto de la vista siguen funcionando. A futuro, self-host de Photon o cambiar de proveedor. |
| El tile server público de OSM tiene límites de uso y exige atribución | Incluir la atribución de OpenStreetMap en el `TileLayer` y mantener el volumen bajo del MVP; a escala, usar un proveedor de tiles propio. |
| Ícono de marcador roto de Leaflet con el bundler | Configurar el ícono por defecto explícitamente (está en el paso 4 del plan). |
| La Geolocation API exige HTTPS en producción | En prod servir por HTTPS; si no hay permiso, cae a `ROSARIO_CENTER` sin romper. |

## Lo que **no** entra en este spec

- Persistir la selección o crear la solicitud de viaje (Spec 04).
- Dibujar la ruta y calcular distancia/tiempo/tarifa (Spec 04).
- Matching o despacho a conductores (Spec 05).
- Elegir puntos con pines arrastrables en el mapa.
- Direcciones favoritas / historial de lugares.
- Mapa para el conductor.
- Autocompletado fuera de Rosario y alrededores.

Cada uno de esos, si aterriza, va en su propio spec.
