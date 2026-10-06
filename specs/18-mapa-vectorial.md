# SPEC 18 — Mapa vectorial (MapLibre + OpenFreeMap) con respaldo a Leaflet

> **Estado:** Implementado
> **Depende de:** SPEC 03, SPEC 04, SPEC 06, SPEC 23
> **Fecha:** 2026-10-06
> **Objetivo:** Reemplazar el mapa base de teselas PNG de OpenStreetMap en Leaflet por un mapa vectorial claro y sobrio (MapLibre GL + OpenFreeMap) en las pantallas de viaje y de alertas, sin cambiar las props de los componentes y con el mapa Leaflet actual como respaldo.

El Spec 03 eligió Leaflet + OpenStreetMap por costo cero y sin API key. Funciona, pero las teselas PNG se ven pixeladas al hacer zoom, el estilo no se puede ajustar (hoy se apaga con un `filter: saturate(0.55)` en CSS) y el tile server público de OSM tiene límites de uso que el propio Spec 03 anotó como riesgo. Este spec cambia el motor y el proveedor manteniendo la misma premisa: sin API key y sin billing.

El número 18 había quedado libre (la numeración saltó del 17 al 19). Este spec no agrega migración: la `0018_privacidad_viajes_conductor.sql` existente pertenece al Spec 17.

## Opciones para el mapa

Opciones evaluadas el 2026-10-06. Se eligió la primera.

| Opción | API key / billing | Tipo | Resultado |
| --- | --- | --- | --- |
| MapLibre GL + OpenFreeMap | No | Vectorial | **Elegida.** |
| Leaflet + otras teselas raster (CARTO Voyager/Positron) | No | PNG raster | Descartada: cambio mínimo, pero sigue siendo raster. |
| MapLibre GL + MapTiler/Stadia | Sí (`NEXT_PUBLIC_`, plan gratuito con límite) | Vectorial | Descartada: suma una cuenta y una key expuesta al navegador. |
| Google Maps | Sí (cuenta de facturación) | Vectorial | Descartada: billing. |

## Alcance

**Incluye:**

- Dependencias nuevas: `maplibre-gl` y `react-map-gl` (versión 8 o superior, usando el entry `react-map-gl/maplibre`).
- `lib/mapa.ts` (nuevo): constantes `ESTILO_MAPA`, `TIMEOUT_MAPA_MS` y `DURACION_ENCUADRE_MS`.
- `lib/use-motor-mapa.ts` (nuevo): hook `useMotorMapa()` que decide qué motor se renderiza (`"vectorial"` o `"leaflet"`) y expone los callbacks para pasar a respaldo.
- Mapa de viajes (lo usan `selector-viaje.tsx`, `viaje-pendiente.tsx` y `panel-conductor.tsx`):
  - `app/viajar/mapa-leaflet.tsx` (nuevo): el contenido actual de `app/viajar/mapa.tsx`, movido sin cambios de comportamiento.
  - `app/viajar/mapa-vectorial.tsx` (nuevo): la implementación MapLibre, con las mismas props.
  - `app/viajar/mapa.tsx`: pasa a ser el punto de entrada que elige motor. Mantiene el `export default` y el tipo exportado `Margen` con la misma firma.
- Mapa de alertas de soporte:
  - `app/soporte/alertas/mapa-alertas-leaflet.tsx` (nuevo): el contenido actual de `mapa-alertas.tsx`, movido sin cambios.
  - `app/soporte/alertas/mapa-alertas-vectorial.tsx` (nuevo): la implementación MapLibre, con la misma prop `alertas`.
  - `app/soporte/alertas/mapa-alertas.tsx`: punto de entrada que elige motor.
- Estilo base: `positron` de OpenFreeMap (claro, casi sin color), para que resalten la ruta azul y los marcadores propios.
- Encuadre animado en el motor vectorial: los reencuadres pasan a ser transiciones de `DURACION_ENCUADRE_MS`. Con `prefers-reduced-motion: reduce` la duración es 0.
- Respaldo: si el navegador no tiene WebGL, si MapLibre emite un error antes de terminar de cargar, o si no termina de cargar en `TIMEOUT_MAPA_MS`, se monta el mapa Leaflet actual (teselas PNG de OSM).
- `app/globals.css`: `@import "maplibre-gl/dist/maplibre-gl.css"`, fondo y fuente de `.maplibregl-map`, y posición de la atribución de MapLibre en el mapa de viajes. Los estilos de Leaflet existentes quedan.
- Atribución visible en los dos mapas vectoriales (OpenFreeMap, OpenMapTiles y OpenStreetMap, la que trae el estilo).
- `README.md`: actualizar la fila "Mapas" de la tabla del stack.
- Comentarios que nombran a Leaflet como único motor (`components/ui.tsx`, `components/iconos.tsx`, `app/globals.css`): ajustar el texto.

**Fuera de alcance (para specs futuros):**

- Cambiar el geocoding (Photon) o el cálculo de ruta: este spec sólo toca cómo se dibuja el mapa.
- Cambiar las props de `Mapa` o de `MapaAlertas`, o los archivos que los consumen (`selector-viaje.tsx`, `viaje-pendiente.tsx`, `panel-conductor.tsx`, `vista-alertas.tsx`).
- Rediseñar marcadores, color o grosor de la ruta.
- Modo oscuro del mapa: la app es sólo modo claro (`app/globals.css`).
- Desinstalar `leaflet`, `react-leaflet` y `@types/leaflet`: siguen siendo el respaldo.
- Encuadre animado en el respaldo Leaflet: conserva `animate: false` (ver Decisiones).
- Self-host de teselas o del estilo de OpenFreeMap.
- Estilo propio (colores de la identidad de la app aplicados al mapa base): se usa `positron` tal cual.
- Rotación e inclinación del mapa, edificios 3D, agrupado de marcadores, elegir puntos tocando el mapa.
- Volver sola al motor vectorial después de haber caído al respaldo sin recargar la página.

## Modelo de datos

Este spec no introduce tablas, columnas, migraciones ni tipos de dominio. Reusa `LatLng` y `Place` de `lib/geocode.ts` y `AlertaSoporte` de `lib/supabase/types.ts`.

### Props (sin cambios)

```ts
// app/viajar/mapa.tsx — igual que hoy
export type Margen = { arriba: number; abajo: number };

export default function Mapa(props: {
  center: LatLng;
  origen: Place | null;
  destino: Place | null;
  ruta?: LatLng[];
  conductor?: LatLng | null;
  buscando?: boolean;          // default false
  margen?: Margen;             // default { arriba: 90, abajo: 80 }
}): JSX.Element;

// app/soporte/alertas/mapa-alertas.tsx — igual que hoy
export default function MapaAlertas(props: { alertas: AlertaSoporte[] }): JSX.Element;
```

`mapa-vectorial.tsx`, `mapa-leaflet.tsx`, `mapa-alertas-vectorial.tsx` y `mapa-alertas-leaflet.tsx` reciben exactamente las mismas props que su punto de entrada.

### Constantes (`lib/mapa.ts`)

```ts
// Estilo vectorial de OpenFreeMap: claro y sobrio, sin API key.
export const ESTILO_MAPA = "https://tiles.openfreemap.org/styles/positron";

// Si el mapa vectorial no terminó de cargar en este tiempo, se pasa al respaldo.
export const TIMEOUT_MAPA_MS = 8000;

// Duración de los reencuadres animados del mapa vectorial.
export const DURACION_ENCUADRE_MS = 600;
```

### Hook `useMotorMapa` (`lib/use-motor-mapa.ts`)

```ts
export type MotorMapa = "vectorial" | "leaflet";

export function useMotorMapa(): {
  motor: MotorMapa;
  alCargar: () => void; // el mapa vectorial emitió `load`: cancela el timeout
  alFallar: () => void; // error antes de `load`: pasa a "leaflet"
};
```

Reglas:

- Valor inicial `"leaflet"` si el navegador no puede crear un contexto WebGL, o si ya se cayó al respaldo antes en esta carga de página. Si no, `"vectorial"`.
- Al montar en `"vectorial"` arranca un timer de `TIMEOUT_MAPA_MS`. Si vence sin que se haya llamado `alCargar`, pasa a `"leaflet"`.
- `alFallar` sólo tiene efecto antes de `alCargar`. Un error posterior (una tesela suelta que falla con el mapa ya cargado) no cambia de motor.
- La caída al respaldo se recuerda en una variable a nivel de módulo: el resto de la sesión de esa pestaña usa Leaflet sin volver a esperar el timeout. Recargar la página lo reinicia. No se usa `localStorage` ni `sessionStorage`.

### Punto de entrada

`app/viajar/mapa.tsx` y `app/soporte/alertas/mapa-alertas.tsx` quedan con la misma forma:

- Llaman a `useMotorMapa()`.
- Con `motor === "vectorial"` renderizan el componente vectorial, pasándole `alCargar` y `alFallar`.
- Con `motor === "leaflet"` renderizan el componente Leaflet, cargado con `dynamic(..., { ssr: false })` para que su código sólo se descargue si hace falta.

### Equivalencias Leaflet → MapLibre (mapa de viajes)

| Hoy (Leaflet) | Motor vectorial |
| --- | --- |
| `MapContainer` con `center`, `zoom={13}`, sin control de zoom | `Map` de `react-map-gl/maplibre` con `initialViewState` (`longitude`, `latitude`, `zoom: 13`), `mapStyle={ESTILO_MAPA}`, sin controles de navegación |
| `TileLayer` de OSM | El estilo `positron` |
| `Polyline` `#1d4ed8`, `weight: 6`, `opacity: 0.9` | `Source` GeoJSON `LineString` + `Layer` `line` con `line-color: #1d4ed8`, `line-width: 6`, `line-opacity: 0.9`, extremos y uniones redondeados |
| `L.divIcon` con `<span class="marcador-origen">` | `Marker` con `anchor="center"` y el mismo `<span className="marcador-origen" />` como hijo |
| `divIcon` de destino, conductor y búsqueda | `Marker` con las mismas clases (`marcador-destino`, `marcador-conductor`, `marcador-busqueda`). El conductor usa el componente `IconoAuto` en vez del string `AUTO_SVG` |
| Onda de búsqueda de 240×240, `interactive={false}` | `Marker` con un contenedor de 240×240 y `pointer-events: none` |
| `fitBounds` con `paddingTopLeft: [40, arriba]`, `paddingBottomRight: [40, abajo]` | `fitBounds` con `padding: { top: arriba, bottom: abajo, left: 40, right: 40 }` y `duration: DURACION_ENCUADRE_MS` |
| Un solo punto: `setView(pt, 15)` + `panBy` | `easeTo({ center, zoom: 15, padding })` con el mismo `padding`, que deja el punto centrado en la franja visible |
| Conductor fuera de `map.getBounds()` → reencuadra origen, destino y conductor | Igual, con `getBounds().contains(...)` de MapLibre |
| `AttributionControl position="topright"` | `AttributionControl` de react-map-gl en `top-right` |

Se mantiene el criterio actual del encuadre: depende de las coordenadas primitivas (no de la referencia de `origen`/`destino`) y no reencuadra en cada fix del conductor mientras siga dentro del cuadro.

MapLibre usa el orden `[lng, lat]`; Leaflet usa `[lat, lng]`. Toda conversión desde `LatLng`/`Place` se hace en un único helper local de cada archivo vectorial.

### Equivalencias (mapa de alertas)

| Hoy (Leaflet) | Motor vectorial |
| --- | --- |
| `Marker` con `iconoAlerta` (`ALERTA_SVG`) | `Marker` con `<span className="marcador-alerta">` y el componente `IconoAlerta` |
| `Popup` hijo del `Marker` | `Popup` de react-map-gl controlado por un estado local con el `id` de la alerta seleccionada; tocar el marcador la selecciona, cerrar el popup la deselecciona |
| `fitBounds` con padding de 30, o `setView(pt, 14)` con una sola | Igual, con `duration: DURACION_ENCUADRE_MS` |
| Sin alertas ubicadas: centra en `ROSARIO_CENTER` | Igual |
| Sin atribución visible | Atribución por defecto de MapLibre (abajo a la derecha) |

`AUTO_SVG` y `ALERTA_SVG` siguen existiendo en `components/iconos.tsx`: los usa el respaldo Leaflet.

### CSS (`app/globals.css`)

- `@import "maplibre-gl/dist/maplibre-gl.css";` junto al import de Leaflet.
- `.maplibregl-map`: `background: var(--color-mapa)` y `font-family: inherit`, igual que `.leaflet-container`.
- En el mapa de viajes, la atribución arriba a la derecha baja `calc(env(safe-area-inset-top) + 76px)`, igual que la regla actual de `.leaflet-top.leaflet-right`. La regla se acota al mapa de viajes con una clase propia en su contenedor, para no mover la atribución del mapa de alertas.
- `.leaflet-tile-pane { filter: ... }` queda: sólo afecta al respaldo. El estilo `positron` no necesita filtro.
- Las clases `.marcador-*` no cambian.

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Commit 1 — este spec.** `specs/18-mapa-vectorial.md`.

2. **Dependencias y CSS base.** `npm install maplibre-gl react-map-gl`. Sumar el `@import` de MapLibre y la regla `.maplibregl-map` en `app/globals.css`. *Verificación:* `npm run build` compila; los mapas siguen viéndose como antes (todavía Leaflet).

3. **Constantes y hook.** `lib/mapa.ts` y `lib/use-motor-mapa.ts`. *Verificación:* `npm run lint` pasa.

4. **Mover el mapa de viajes actual.** Crear `app/viajar/mapa-leaflet.tsx` con el contenido de `mapa.tsx`. `mapa.tsx` queda reexportando el default de `mapa-leaflet.tsx` y el tipo `Margen`. *Verificación:* `/viajar` y `/conducir` se ven y se comportan igual que antes.

5. **Mapa de viajes vectorial.** `app/viajar/mapa-vectorial.tsx`: `Map` con `positron`, marcadores, ruta y atribución, todavía sin usarlo desde `mapa.tsx`. *Verificación:* `npm run build` y `npm run lint` pasan.

6. **Encuadre vectorial.** Sumar a `mapa-vectorial.tsx` los dos efectos de encuadre (ruta/origen/destino y conductor fuera de cuadro), animados y respetando `prefers-reduced-motion`. *Verificación:* `npm run lint` pasa.

7. **Selección de motor en viajes.** `app/viajar/mapa.tsx` usa `useMotorMapa()` y elige entre `mapa-vectorial.tsx` y `mapa-leaflet.tsx` (este último con `dynamic`). Regla CSS de la atribución en el mapa de viajes. *Verificación:* `/viajar` muestra el mapa `positron`; bloqueando `tiles.openfreemap.org` en DevTools y recargando, aparece el mapa Leaflet de OSM.

8. **Mapa de alertas.** Mover el actual a `mapa-alertas-leaflet.tsx`, crear `mapa-alertas-vectorial.tsx` y convertir `mapa-alertas.tsx` en el punto de entrada con `useMotorMapa()`. *Verificación:* `/soporte/alertas` muestra el mapa `positron` con los marcadores rojos y el popup.

9. **Documentación.** Fila "Mapas" del `README.md` y comentarios que nombran a Leaflet como único motor en `components/ui.tsx`, `components/iconos.tsx` y `app/globals.css`. *Verificación:* `npm run build` y `npm run lint` pasan.

10. **Prueba end-to-end.** Ver "Caso de prueba". *Verificación:* todos los criterios de aceptación.

## Caso de prueba

Precondición: `npm run dev` en `http://localhost:3000`, una cuenta pasajero (P), una cuenta conductor (C) con perfil completo y la cuenta de soporte (S) con al menos una alerta con ubicación.

| # | Paso | Resultado esperado |
| --- | --- | --- |
| 1 | Como P, abrir `/viajar`. | Mapa claro `positron` centrado en la ubicación o en Rosario centro. En la pestaña Network no hay requests a `tile.openstreetmap.org`. |
| 2 | Hacer zoom con la rueda o con dos dedos. | Las calles y los nombres se mantienen nítidos en zooms intermedios (no se pixelan). |
| 3 | Elegir origen y destino. | Aparecen el marcador circular y el cuadrado de siempre, y la ruta azul. El mapa hace una transición suave hasta encuadrar la ruta entre los controles de arriba y el panel de abajo. |
| 4 | Solicitar el viaje. | La onda de búsqueda pulsa sobre el origen, igual que antes. |
| 5 | Como C, en `/conducir`, aceptar la oferta. | El mapa de C y el de P muestran el marcador azul del conductor. |
| 6 | Mover a C fuera del cuadro visible de P (simulando ubicación en DevTools). | El mapa de P reencuadra con una transición para incluir origen, destino y conductor. Mientras C se mueve dentro del cuadro, el mapa no se mueve. |
| 7 | Finalizar el viaje en medio de un reencuadre. | La pantalla cambia sin errores en la consola. |
| 8 | Como S, abrir `/soporte/alertas`. | Mapa `positron` con un marcador rojo por alerta con ubicación. Tocar uno abre el popup con usuario, origen → destino y hora. |
| 9 | En DevTools, bloquear el dominio `tiles.openfreemap.org` y recargar `/viajar`. | En `TIMEOUT_MAPA_MS` o menos aparece el mapa Leaflet con teselas de OSM, con los mismos marcadores y ruta. |
| 10 | Con el bloqueo activo, navegar a otra pantalla con mapa sin recargar. | El mapa Leaflet aparece de inmediato, sin esperar otra vez el timeout. |
| 11 | Quitar el bloqueo y recargar. | Vuelve el mapa `positron`. |
| 12 | Activar "reducir movimiento" en el sistema y repetir el paso 3. | El encuadre salta sin transición. |

## Criterios de aceptación

- [ ] `/viajar`, `/conducir` y `/soporte/alertas` muestran el estilo `positron` de OpenFreeMap renderizado con MapLibre.
- [ ] Con el motor vectorial activo no se hace ningún request a `tile.openstreetmap.org`.
- [ ] `selector-viaje.tsx`, `viaje-pendiente.tsx`, `panel-conductor.tsx` y `vista-alertas.tsx` no tienen cambios en el diff.
- [ ] `app/viajar/mapa.tsx` sigue exportando por default un componente con las props `center`, `origen`, `destino`, `ruta`, `conductor`, `buscando` y `margen`, y el tipo `Margen`.
- [ ] Los marcadores de origen, destino, conductor, búsqueda y alerta usan las mismas clases CSS que antes y quedan centrados sobre su coordenada.
- [ ] La ruta se dibuja en `#1d4ed8`, 6 px, opacidad 0.9.
- [ ] Con origen, destino y ruta, el encuadre deja la ruta completa visible entre los controles superiores y el panel inferior, respetando `margen`.
- [ ] El reencuadre del motor vectorial es una transición animada, y es instantáneo con `prefers-reduced-motion: reduce`.
- [ ] El mapa no reencuadra mientras el conductor se mueve dentro del cuadro visible, y sí cuando sale.
- [ ] Desmontar el mapa durante una animación no deja errores en la consola.
- [ ] Con `tiles.openfreemap.org` bloqueado, cada pantalla con mapa termina mostrando el mapa Leaflet de OSM en `TIMEOUT_MAPA_MS` o menos, con los mismos marcadores y ruta.
- [ ] Tras una caída al respaldo, las siguientes pantallas con mapa de la misma carga de página usan Leaflet sin esperar el timeout.
- [ ] En `/soporte/alertas`, tocar un marcador abre un popup con usuario, origen → destino y hora.
- [ ] La atribución es visible en los dos mapas vectoriales y, en el mapa de viajes, no queda tapada por los controles flotantes ni por el panel.
- [ ] `package.json` incluye `maplibre-gl` y `react-map-gl`, y conserva `leaflet`, `react-leaflet` y `@types/leaflet`.
- [ ] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** MapLibre GL + OpenFreeMap. **No:** otras teselas raster en Leaflet, MapTiler/Stadia, Google Maps. Es la única opción vectorial sin API key ni billing, que es la premisa del Spec 03. Ver "Opciones para el mapa".
- **Sí:** estilo `positron`. **No:** `liberty` o `bright` (más coloridos), ni estilo oscuro. El equipo pidió un mapa claro y sobrio; la app es sólo modo claro y la ruta y los marcadores tienen que resaltar.
- **Sí:** `react-map-gl/maplibre`. **No:** `maplibre-gl` directo con `useEffect` y refs. El wrapper es declarativo como `react-leaflet`, así que la estructura de los componentes se conserva y la limpieza al desmontar la hace la librería.
- **Sí:** reemplazar los dos mapas (viajes y alertas). **No:** dejar el de alertas en Leaflet. Evita que la app muestre dos mapas base distintos según la pantalla.
- **Sí:** respaldo montando el componente Leaflet actual. **No:** respaldo con teselas raster de OSM dentro de MapLibre. Leaflet cubre también el caso sin WebGL, que un respaldo dentro de MapLibre no cubre. El costo aceptado es mantener dos motores, dos juegos de marcadores y las tres dependencias de Leaflet.
- **Sí:** el respaldo Leaflet se carga con `dynamic`. **No:** importarlo estático en el punto de entrada. En el caso normal su código no se descarga.
- **Sí:** el respaldo se dispara por falta de WebGL, error antes de `load` o timeout de 8 s. **No:** reintentos ni chequeo previo de disponibilidad de OpenFreeMap. Un reintento duplica la espera con el mapa en blanco.
- **Sí:** recordar la caída al respaldo en una variable de módulo. **No:** `localStorage`/`sessionStorage`. Si OpenFreeMap está caído, no se espera el timeout en cada pantalla; al recargar se vuelve a intentar, así una caída puntual no deja al usuario en Leaflet para siempre.
- **Sí:** encuadre animado en el motor vectorial. **No:** en el respaldo Leaflet. `mapa-leaflet.tsx` conserva `animate: false` porque en Leaflet una animación en vuelo al desmontar rompe el mapa (comentario del código actual). MapLibre cancela sus animaciones al destruirse.
- **Sí:** marcadores como JSX con las mismas clases `.marcador-*`. **No:** marcadores como capas del estilo (symbol layers). Mantiene el aspecto idéntico y reutiliza el CSS, incluida la animación `pulso`.
- **Sí:** conservar `AUTO_SVG` y `ALERTA_SVG`. **No:** borrarlos. Los `divIcon` del respaldo Leaflet necesitan HTML crudo.
- **Sí:** mostrar atribución también en el mapa de alertas. **No:** dejarlo sin atribución como hoy. OpenFreeMap y OpenStreetMap la exigen.
- **Sí:** mismas props y mismos archivos de entrada. **No:** aprovechar para cambiar la interfaz del componente. Es el requisito del pedido y deja a los cuatro consumidores fuera del diff.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| OpenFreeMap es un servicio público gratuito sin SLA: puede caerse o limitar. | Respaldo a Leaflet + OSM por error o timeout. A escala, self-host del estilo y las teselas en un spec aparte. |
| Orden de coordenadas invertido (`[lng, lat]` en MapLibre, `[lat, lng]` en Leaflet): un error deja los marcadores en el océano. | Un único helper de conversión por archivo vectorial; el paso 3 del Caso de prueba lo detecta a simple vista. |
| `maplibre-gl` pesa bastante más que Leaflet en el bundle. | Los mapas ya se cargan con `dynamic(..., { ssr: false })`, fuera del bundle inicial; el respaldo Leaflet sólo se descarga si hace falta. |
| Un error de una sola tesela antes de `load` dispara el respaldo aunque el proveedor esté bien. | Aceptado: el usuario ve un mapa funcional igual, y recargar vuelve a intentar el vectorial. |
| En una red muy lenta el mapa vectorial tarda más de 8 s y cae al respaldo sin que el proveedor esté caído. | Aceptado: el respaldo también es un mapa funcional. `TIMEOUT_MAPA_MS` es una constante única, ajustable. |
| Dos implementaciones de cada mapa pueden desincronizarse (un marcador nuevo agregado sólo en una). | Las dos reciben las mismas props y viven en archivos hermanos; el paso 9 del Caso de prueba ejercita el respaldo. |
| `react-map-gl` o `maplibre-gl` incompatibles con React 19 / Next.js 16 (Turbopack, workers). | Se detecta en el paso 2 del plan (`npm run build`), antes de escribir los componentes. |
| El offset de la atribución aplicado globalmente movería también la del mapa de alertas. | La regla se acota con una clase propia del contenedor del mapa de viajes. |

## Notas de implementación

Tres ajustes que no estaban en el plan y aparecieron al probar en el navegador:

- **Worker de MapLibre como estático.** `maplibre-gl` 6 deduce la URL de su Web Worker a partir de `import.meta.url`, y el bundler de Next la rompe ("Worker failed to load"). `scripts/copiar-worker-maplibre.mjs` copia `maplibre-gl-worker.mjs` y `maplibre-gl-shared.mjs` a `public/maplibre/` (carpeta en `.gitignore`), corre en `predev` y `prebuild`, y los dos mapas vectoriales reciben `workerUrl={WORKER_MAPA}` (`lib/mapa.ts`).
- **`proxy.ts`:** el `matcher` excluye `maplibre/`, para que el worker no pase por el refresco de sesión de Supabase en cada carga.
- **El timeout sólo corre con la pestaña visible.** En segundo plano el navegador no dibuja y MapLibre nunca emite `load`; sin esto, abrir la app en una pestaña de fondo caía siempre al respaldo. `useMotorMapa` reinicia el timer en cada `visibilitychange`.

También se agregó `ZOOM_MAX_ENCUADRE = 17` (`lib/mapa.ts`) como tope de zoom de los encuadres, y los márgenes del encuadre se achican en proporción cuando el panel y los controles no dejan al menos 120 px de mapa (MapLibre, a diferencia de Leaflet, no encuadra si el relleno no entra en el contenedor).

## Lo que **no** entra en este spec

- Cambios en geocoding (Photon) o en el cálculo de ruta.
- Cambios en las props de `Mapa`/`MapaAlertas` o en sus consumidores.
- Rediseño de marcadores o de la ruta.
- Modo oscuro del mapa.
- Desinstalar Leaflet.
- Encuadre animado en el respaldo Leaflet.
- Self-host de teselas o estilo propio del mapa base.
- Rotación, inclinación, 3D, agrupado de marcadores o selección de puntos tocando el mapa.

Cada uno de esos, si aterriza, va en su propio spec.
