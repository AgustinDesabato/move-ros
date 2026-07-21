# SPEC 04 — Solicitud de viaje y estimación de tarifa

> **Estado:** Implementado
> **Depende de:** SPEC 01, SPEC 02, SPEC 03
> **Fecha:** 2026-07-21
> **Objetivo:** Que el pasajero, sobre el mapa del Spec 03, vea la ruta por calles entre origen y destino con su distancia, tiempo estimado y tarifa, y pueda **solicitar el viaje**, creando una solicitud persistente en Supabase en estado `pendiente` a la espera de un conductor.

Este spec construye sobre la selección de origen/destino del Spec 03: agrega el ruteo real (OSRM), la estimación de tarifa y la primera estructura persistente de viajes (`trips`). Deja el viaje creado en estado `pendiente`; el matching y despacho a conductores es el Spec 05.

## Alcance

**Incluye:**

- Migración SQL: enum `trip_status` y tabla `trips` (una fila por solicitud de viaje del pasajero), protegida con RLS.
- Route Handler `app/api/ruteo/route.ts` que proxya a **OSRM** (`router.project-osrm.org`) con `User-Agent` propio y devuelve distancia (m), duración (s) y la polilínea de la ruta.
- Helper server `lib/osrm.ts` que consulta OSRM directamente (usado por el Route Handler y por la Server Action), y helper cliente `lib/ruteo.ts` que consulta `/api/ruteo`.
- Helper `lib/tarifa.ts` con las constantes de precio y `calcularTarifa(distanciaM, duracionS)`.
- El componente de mapa dibuja la **ruta** (polilínea) además de los marcadores, y encuadra la vista a la ruta.
- Panel de estimación en `/viajar`: cuando hay origen y destino, muestra distancia, tiempo y **tarifa estimada**, con un botón **"Solicitar viaje"**.
- Server Action `solicitarViaje` que **recalcula ruta y tarifa del lado del servidor** (no confía en los números del cliente) e inserta la fila en `trips` con estado `pendiente`.
- Estado de "viaje pendiente" en `/viajar`: si el pasajero tiene una solicitud activa, la vista muestra la solicitud ("buscando conductor…") en vez del selector, con un botón **"Cancelar"**.
- Server Action `cancelarViaje` que pasa la solicitud a estado `cancelada`.
- Regla de una sola solicitud activa por pasajero a la vez.

**Fuera de alcance (para specs futuros):**

- Matching, oferta y despacho a conductores; que el conductor vea o acepte solicitudes (Spec 05).
- Estados de viaje más allá de `pendiente`/`cancelada` (`aceptada`, `en_curso`, `finalizada`, …) — los agrega el Spec 05.
- Historial / lista de viajes anteriores del pasajero.
- Pago, cobro real o pasarela; la tarifa es sólo una **estimación** mostrada.
- Tarifa dinámica por demanda, horarios, peajes o zonas.
- Persistir la polilínea de la ruta (se recalcula cuando se necesita).
- Notificaciones push o tiempo real (el estado se ve al recargar/navegar).
- Elegir puntos con pines arrastrables (sigue fuera, como en el Spec 03).

## Modelo de datos

Migración `supabase/migrations/0003_trips.sql`.

Enum de estado. En este spec sólo se usan `pendiente` y `cancelada`; el Spec 05 ampliará el enum (`aceptada`, `en_curso`, `finalizada`, …) con `alter type`.

```sql
create type public.trip_status as enum ('pendiente', 'cancelada');
```

Tabla `trips`, una fila por solicitud de viaje:

```sql
create table public.trips (
  id               uuid              primary key default gen_random_uuid(),
  pasajero_id      uuid              not null references public.profiles (id) on delete cascade,
  origen_lat       double precision  not null,
  origen_lng       double precision  not null,
  origen_label     text              not null,
  destino_lat      double precision  not null,
  destino_lng      double precision  not null,
  destino_label    text              not null,
  distancia_m      integer           not null,  -- metros, según OSRM
  duracion_s       integer           not null,  -- segundos, según OSRM
  tarifa_estimada  integer           not null,  -- pesos, entero
  estado           public.trip_status not null default 'pendiente',
  created_at       timestamptz       not null default now()
);

alter table public.trips enable row level security;

create policy "El pasajero ve sus viajes"
  on public.trips for select
  using ( auth.uid() = pasajero_id );

create policy "El pasajero crea sus viajes"
  on public.trips for insert
  with check ( auth.uid() = pasajero_id );

create policy "El pasajero actualiza sus viajes"
  on public.trips for update
  using ( auth.uid() = pasajero_id );
```

Índice para encontrar rápido la solicitud activa del pasajero:

```sql
create index trips_pasajero_estado_idx on public.trips (pasajero_id, estado);
```

Tipos TypeScript (en `lib/supabase/types.ts`, extendiendo lo anterior):

```ts
export type TripStatus = "pendiente" | "cancelada";

export type Trip = {
  id: string;
  pasajero_id: string;
  origen_lat: number;
  origen_lng: number;
  origen_label: string;
  destino_lat: number;
  destino_lng: number;
  destino_label: string;
  distancia_m: number;
  duracion_s: number;
  tarifa_estimada: number;
  estado: TripStatus;
  created_at: string;
};
```

Tipo de ruta (en `lib/ruteo.ts`):

```ts
import type { LatLng } from "@/lib/geocode";

// Resultado del ruteo: distancia, duración y la polilínea por calles.
export type Ruta = {
  distanciaM: number;    // metros
  duracionS: number;     // segundos
  puntos: LatLng[];      // la polilínea, ya como { lat, lng }
};
```

Constantes y fórmula de tarifa (en `lib/tarifa.ts`):

```ts
// Valores MVP para Rosario, en pesos. Revisables.
export const TARIFA_BASE = 700;     // bandera de bajada
export const TARIFA_KM = 250;       // por kilómetro
export const TARIFA_MIN = 40;       // por minuto
export const TARIFA_MINIMA = 1000;  // piso

// tarifa = max(MINIMA, BASE + km*KM + min*MIN), redondeada a $50.
export function calcularTarifa(distanciaM: number, duracionS: number): number {
  const km = distanciaM / 1000;
  const min = duracionS / 60;
  const bruta = TARIFA_BASE + km * TARIFA_KM + min * TARIFA_MIN;
  const redondeada = Math.round(bruta / 50) * 50;
  return Math.max(TARIFA_MINIMA, redondeada);
}
```

**Convenciones:**

- OSRM recibe y devuelve coordenadas como `lng,lat` (igual que GeoJSON); en la app siempre usamos `{ lat, lng }`. El mapeo se hace en un solo lugar (`lib/osrm.ts`), como con Photon en el Spec 03.
- `distancia_m` y `duracion_s` se guardan como enteros (metros y segundos) tal cual los da OSRM; la conversión a km/min/tarifa vive en `lib/tarifa.ts`.
- `tarifa_estimada` es un entero en pesos, ya redondeado. Es una estimación mostrada, no un cobro.
- La fila autoritativa la escribe el servidor: la Server Action recalcula ruta y tarifa antes de insertar; nunca persiste los números que mandó el cliente.

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Aplicar la migración.** Guardar y ejecutar `supabase/migrations/0003_trips.sql` (enum `trip_status`, tabla `trips` con RLS, índice). Verificación manual: en el dashboard existen el enum, la tabla `trips`, sus tres policies y el índice.

2. **Tipos + tarifa.** Extender `lib/supabase/types.ts` (`TripStatus`, `Trip`) y crear `lib/tarifa.ts` (constantes + `calcularTarifa`). Verificación: `npm run lint` pasa.

3. **Ruteo (server + proxy + cliente).**
   - `lib/osrm.ts`: `rutaOSRM(origen, destino): Promise<Ruta | null>` — llama a `https://router.project-osrm.org/route/v1/driving/{lng},{lat};{lng},{lat}?overview=full&geometries=geojson` con `User-Agent` propio, mapea `routes[0]` a `Ruta` (distancia, duración y `geometry.coordinates` → `{ lat, lng }[]`). Ante error/timeout devuelve `null`.
   - `app/api/ruteo/route.ts`: `GET` que acepta `?ox=&oy=&dx=&dy=` (o `origen`/`destino`), llama a `rutaOSRM` y devuelve la `Ruta` como JSON (o 502/`null` si falla).
   - `lib/ruteo.ts`: tipo `Ruta` y `obtenerRuta(origen, destino): Promise<Ruta | null>` que consulta `/api/ruteo`.

   Verificación: `curl "localhost:3000/api/ruteo?ox=-60.65&oy=-32.94&dx=-60.70&dy=-32.98"` devuelve distancia, duración y una lista de puntos.

4. **El mapa dibuja la ruta.** En `app/viajar/mapa.tsx` agregar una prop opcional `ruta?: LatLng[]`; si viene, renderizar un `<Polyline>` de `react-leaflet` y encuadrar la vista a la ruta (en vez de sólo a los dos marcadores). Verificación: pasando una ruta, se ve la línea por calles entre origen y destino.

5. **Panel de estimación.** En `app/viajar/selector-viaje.tsx`: cuando hay `origen` y `destino`, llamar a `obtenerRuta` (con manejo de carga/error), pasar `ruta.puntos` al mapa y mostrar un panel con distancia (km), tiempo (min) y **tarifa estimada** (`calcularTarifa`). Incluir el botón **"Solicitar viaje"** (deshabilitado mientras carga la ruta o si falló). Verificación: al elegir origen y destino aparecen los números y la ruta en el mapa.

6. **Server Actions de viaje.** Crear `app/actions/viaje.ts` (`"use server"`):
   - `solicitarViaje(origen, destino)`: valida que haya usuario pasajero con perfil completo; **rechaza si ya tiene una solicitud `pendiente`**; recalcula la ruta con `rutaOSRM` y la tarifa con `calcularTarifa` (autoritativo, del lado del servidor); inserta la fila en `trips` (`estado = 'pendiente'`). En éxito, `revalidatePath('/viajar')` / `redirect('/viajar')`.
   - `cancelarViaje(tripId)`: `update` de `trips` a `estado = 'cancelada'` para la fila del pasajero (RLS garantiza que sea suya). Luego `revalidatePath('/viajar')`.

   Verificación: `npm run build` compila sin errores de tipo.

7. **Estado pendiente en `/viajar`.** En `app/viajar/page.tsx`, después del gate de perfil, consultar la solicitud activa (`trips` del pasajero con `estado = 'pendiente'`, la más reciente). Si existe, renderizar un componente nuevo `app/viajar/viaje-pendiente.tsx` (origen/destino, distancia/tiempo/tarifa, "Buscando conductor…" y botón **Cancelar** que dispara `cancelarViaje`); si no, renderizar el `SelectorViaje` de siempre. Cablear el botón "Solicitar viaje" del selector a `solicitarViaje`. Verificación: elegir origen/destino → "Solicitar viaje" crea la fila `pendiente` y la vista pasa a "Buscando conductor…"; "Cancelar" la cancela y vuelve el selector.

## Criterios de aceptación

- [ ] Existen en Supabase el enum `trip_status`, la tabla `trips` con sus tres policies de RLS y el índice `trips_pasajero_estado_idx`.
- [ ] `GET /api/ruteo?ox=&oy=&dx=&dy=` devuelve JSON con `distanciaM`, `duracionS` y `puntos` (la polilínea) para dos puntos del Gran Rosario.
- [ ] En `/viajar`, al elegir origen y destino, el mapa dibuja la ruta por calles entre ambos y encuadra la vista a la ruta.
- [ ] Con origen y destino elegidos, el panel muestra distancia (km), tiempo estimado (min) y tarifa estimada calculada como `max(1000, base 700 + $250/km + $40/min)`, redondeada a $50.
- [ ] Si el ruteo falla o no responde, la app no rompe: muestra un aviso y el botón "Solicitar viaje" queda deshabilitado.
- [ ] "Solicitar viaje" crea una fila en `trips` con `estado = 'pendiente'`, el origen/destino y la distancia/duración/tarifa **recalculadas por el servidor** (no las del cliente).
- [ ] Un pasajero con una solicitud `pendiente` que vuelve a `/viajar` ve la pantalla "Buscando conductor…" con los datos del viaje, no el selector.
- [ ] Intentar solicitar un segundo viaje mientras hay uno `pendiente` no crea una segunda fila.
- [ ] "Cancelar" pasa la solicitud a `estado = 'cancelada'` y `/viajar` vuelve a mostrar el selector vacío.
- [ ] Un pasajero no ve ni puede cancelar solicitudes de otro usuario (RLS).
- [ ] Se mantienen los gates previos: sin sesión → `/login`; perfil incompleto → `/perfil`; conductor en `/viajar` → `/conducir`.
- [ ] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** OSRM público (`router.project-osrm.org`) para el ruteo. Gratis, sin API key ni billing; consistente con Photon/OSM del Spec 03. **No:** GraphHopper/Mapbox (exigen key o tarjeta).
- **Sí:** proxy `/api/ruteo`, como `/api/geocode`. Controla `User-Agent`, permite cacheo y evita CORS y el límite por IP del cliente.
- **Sí:** la Server Action **recalcula ruta y tarifa del lado del servidor** antes de persistir. El pasajero no puede falsear la tarifa manipulando el cliente; los números del panel son sólo una vista previa.
- **Sí:** tarifa = base + por km + por minuto, con piso, redondeada a $50 (`700 + $250/km + $40/min`, mínima `$1000`). Valores MVP para Rosario, revisables. **No:** tarifa dinámica por demanda/horario (spec futuro).
- **Sí:** enum `trip_status` con sólo `pendiente`/`cancelada` en este spec. El Spec 05 lo amplía con `alter type`. **No:** agregar estados que todavía no se usan.
- **Sí:** una sola solicitud `pendiente` por pasajero a la vez. Simplifica el modelo y la vista.
- **Sí:** guardar origen/destino como `lat`/`lng` (double precision) + `label`, igual que el `Place` del Spec 03. **No:** PostGIS por ahora (innecesario para el MVP).
- **No:** persistir la polilínea de la ruta. Se recalcula con OSRM cuando hace falta; mantiene la tabla liviana.
- **No:** historial de viajes, pago real, ni notificaciones en tiempo real. Cada uno a su propio spec.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El OSRM público puede rate-limitear o caerse → no se puede rutear ni estimar | Manejar timeout/error devolviendo `null`; el panel muestra un aviso y deshabilita "Solicitar viaje". El resto de la vista (mapa, marcadores) sigue funcionando. A futuro, self-host de OSRM o cambiar de proveedor. |
| El pasajero podría manipular el cliente para enviar una tarifa falsa | La Server Action recalcula ruta y tarifa en el servidor e ignora los números del cliente; sólo persiste lo recalculado. |
| Carrera al solicitar dos viajes casi simultáneos → dos filas `pendiente` | La action chequea que no haya `pendiente` antes de insertar. Es un chequeo best-effort (sin transacción atómica desde `supabase-js`); aceptable para el MVP y endurecible con un índice parcial único en un spec futuro. |
| La distancia/tiempo de OSRM difieren de la realidad (tráfico, cortes) | Es una estimación explícita; se comunica como "estimado". El cobro real queda fuera de alcance. |
| `gen_random_uuid()` no disponible | Está incluido en Postgres 13+ (Supabase). Si faltara, habilitar `pgcrypto`. |

## Lo que **no** entra en este spec

- Matching, oferta y aceptación por parte del conductor (Spec 05).
- Estados de viaje más allá de `pendiente`/`cancelada` (Spec 05).
- Historial / lista de viajes del pasajero.
- Pago o cobro real, pasarela de pagos.
- Tarifa dinámica por demanda, horario o zonas.
- Notificaciones push / actualización en tiempo real.
- Persistir la polilínea de la ruta.

Cada uno de esos, si aterriza, va en su propio spec.
