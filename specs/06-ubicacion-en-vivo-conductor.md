# SPEC 06 — Seguimiento de ubicación en vivo del conductor

> **Estado:** Implementado
> **Depende de:** SPEC 01, SPEC 02, SPEC 03, SPEC 04, SPEC 05
> **Fecha:** 2026-07-22
> **Objetivo:** Que, mientras un viaje está `aceptada` o `en_curso`, el conductor comparta su posición GPS desde `/conducir` y el pasajero la vea moverse como un marcador en un mapa en `/viajar`, con actualización por polling (~5s) y sin ruteo en vivo.

Este spec construye sobre el ciclo de viaje del Spec 05: una vez que un conductor acepta, comparte su posición del navegador (`watchPosition`) mientras el viaje está activo, y el pasajero la ve como un marcador que se mueve en un mapa. La posición se guarda como último punto en `profiles`, se refresca por polling reusando el `tick` que ya trae los datos del conductor, y se borra al cerrar el viaje. El ruteo en vivo, el ETA y Realtime quedan fuera de alcance.

## Alcance

**Incluye:**

- Migración SQL `supabase/migrations/0005_ubicacion_conductor.sql` (idempotente):
  - Columnas nuevas en `profiles`: `ubic_lat double precision`, `ubic_lng double precision`, `ubic_at timestamptz` (todas nullable; null = el conductor no está compartiendo ubicación).
  - Ampliar la RPC `datos_conductor(p_trip_id)` para que, además de nombre + vehículo, devuelva la ubicación del conductor asignado.
  - Extender las RPC `finalizar_viaje`, `bajarse_viaje` y `cancelar_viaje` para **limpiar** (`null`) las columnas `ubic_*` del conductor asignado al cerrar/soltar el viaje.
- Migración SQL `supabase/migrations/0006_ubicacion_server_time.sql` (idempotente) — frescura calculada en el servidor (ver *Notas de implementación*):
  - RPC `reportar_ubicacion(p_lat, p_lng)` que escribe `ubic_at = now()` del **servidor**, validando `auth.uid()` + rol conductor.
  - `datos_conductor` recreada: devuelve `ubic_lat`, `ubic_lng` y un booleano `ubic_vigente` (`now() - ubic_at < 30s`) en vez del timestamp crudo.
- **Server Action del conductor** (`app/actions/conductor.ts`, extendida): `reportarUbicacion(lat, lng)` que llama al RPC `reportar_ubicacion` (hora del servidor).
- **Emisión de posición en `/conducir`:** con `navigator.geolocation.watchPosition()`, activo **sólo mientras el conductor tiene un viaje `aceptada`/`en_curso`**. Cada fix se **acota a ~5s** (`POLL_MS`) antes de llamar a `reportarUbicacion`.
- **Gate de ubicación en tiempo real al aceptar:** en `/conducir`, el botón **Aceptar** de una oferta queda deshabilitado hasta que el conductor **comparte una ubicación real obtenida en el momento** (botón "Compartir mi ubicación" → `getCurrentPosition`); no alcanza con que el permiso esté concedido de antes. Cada oferta nueva exige un fix fresco. El conductor puede **Rechazar** igual.
- **Mapa en `/conducir` con viaje activo:** durante `aceptada`/`en_curso`, la tarjeta del viaje incorpora un mapa con la posición del conductor + origen y destino del viaje.
- **Mapa en `/viajar` con marcador del conductor:** durante `aceptada`/`en_curso`, `viaje-pendiente.tsx` muestra un mapa con origen, destino y el **marcador del conductor** que se refresca por polling. Si el servidor no marca la posición como vigente (`ubic_vigente = false` o coords nulas), muestra "Ubicando al conductor…" en vez del marcador.
- **Consumo de la posición por el pasajero:** `estadoViajeActivo` ya llama a `datos_conductor`; `ConductorPublico` gana `ubic_lat`/`ubic_lng`/`ubic_vigente` y el pasajero los usa para posicionar el marcador. Sin request extra: viaja en el mismo `tick` de 5s.
- **Componente de mapa reutilizable:** `app/viajar/mapa.tsx` acepta un marcador de conductor opcional (ícono 🚗 distinguible), reencuadrando para mantenerlo visible; sin re-ruteo.

**Fuera de alcance (para specs futuros):**

- Ruteo en vivo del conductor hacia el punto de encuentro o hacia el destino (línea/polilínea que se recalcula); acá es sólo un marcador puntual.
- Supabase Realtime; el refresco de la posición sigue siendo por polling (~5s).
- ETA dinámico ("llega en X min") calculado desde la posición del conductor.
- Historial de recorrido / traza del viaje (breadcrumbs); sólo se guarda el último punto.
- Compartir la ubicación del conductor cuando está ocioso (sin viaje activo).
- Ubicación del pasajero compartida al conductor (acá sólo viaja conductor → pasajero).
- Orientación/heading, velocidad o precisión del GPS en la UI.
- Suavizado/animación de interpolación del marcador entre fixes; salta de punto a punto.

## Modelo de datos

Migración `supabase/migrations/0005_ubicacion_conductor.sql`. Idempotente (segura de re-ejecutar).

### Columnas nuevas en `profiles`

La "última posición conocida" del conductor. Un solo punto por usuario (sin historial), coherente con cómo ya vive `last_seen_at`. `null` = no está compartiendo ubicación (ocioso, o viaje ya cerrado).

```sql
alter table public.profiles
  add column if not exists ubic_lat double precision,
  add column if not exists ubic_lng double precision,
  add column if not exists ubic_at  timestamptz;
```

Convención: se considera **posición vigente** la que tiene `ubic_lat`/`ubic_lng` no nulos y `ubic_at > now() - 30s`. Fuera de eso, el pasajero ve "Ubicando al conductor…".

### Escritura de la posición

Self-update de `profiles` cubierto por la policy de update del Spec 01/02 (`auth.uid() = id`); no hace falta policy ni RPC nueva. La Server Action `reportarUbicacion` hace:

```sql
update public.profiles
   set ubic_lat = :lat, ubic_lng = :lng, ubic_at = now()
 where id = auth.uid() and role = 'conductor';
```

### Ampliación de la RPC `datos_conductor`

La función del Spec 05 (`security definer`) que hoy devuelve nombre + vehículo del conductor asignado a un viaje, gana tres columnas de ubicación. El pasajero sólo puede leerla para **su** viaje (la función valida `pasajero_id = auth.uid()`), evitando exponer la posición del conductor por fuera de un viaje activo.

```sql
-- Cambia el tipo de retorno: drop + create (create or replace no permite
-- alterar la firma de la tabla devuelta).
drop function if exists public.datos_conductor(uuid);

create function public.datos_conductor(p_trip_id uuid)
returns table (
  nombre   text,
  marca    text,
  modelo   text,
  patente  text,
  color    text,
  ubic_lat double precision,
  ubic_lng double precision,
  ubic_at  timestamptz
)
language sql
security definer
set search_path = public
as $$
  select p.nombre, v.marca, v.modelo, v.patente, v.color,
         p.ubic_lat, p.ubic_lng, p.ubic_at
    from public.trips t
    join public.profiles p on p.id = t.conductor_id
    join public.vehicles v on v.profile_id = p.id
   where t.id = p_trip_id
     and t.pasajero_id = auth.uid()
     and t.conductor_id is not null;
$$;
```

*(La forma exacta del join a `vehicles` se ajusta a como quedó en el Spec 05; lo que importa acá es que se suman `ubic_lat`/`ubic_lng`/`ubic_at`.)*

### Limpieza al cerrar el viaje

`finalizar_viaje`, `bajarse_viaje` y `cancelar_viaje` (todas `security definer`, ya existentes) suman, cuando cierran/sueltan el viaje, la limpieza de la posición del conductor asignado:

```sql
update public.profiles
   set ubic_lat = null, ubic_lng = null, ubic_at = null
 where id = <conductor del viaje>;
```

Así la ubicación deja de existir en cuanto el viaje termina, y no queda un último punto "colgado" entre viajes.

### Tipos TypeScript (`lib/supabase/types.ts`, extendiendo lo anterior)

```ts
// Profile gana las tres columnas de ubicación.
export type Profile = {
  // …campos previos (incluye last_seen_at)…
  ubic_lat: number | null;
  ubic_lng: number | null;
  ubic_at: string | null;
};

// ConductorPublico (lo que ve el pasajero) gana la ubicación.
export type ConductorPublico = {
  nombre: string | null;
  marca: string;
  modelo: string;
  patente: string;
  color: string;
  ubic_lat: number | null;
  ubic_lng: number | null;
  ubic_at: string | null;
};
```

### Constante de frescura (`lib/despacho.ts`, extendida)

```ts
export const UBIC_TTL_S = 30;   // ventana de "posición del conductor vigente"
```

**Convenciones:**

- La posición vigente del conductor es a lo sumo una: `profiles.ubic_*` no nulo y `ubic_at > now() - UBIC_TTL_S`.
- La escritura de la posición es un self-update acotado a ~5s; la lectura del pasajero viaja gratis en el `tick` que ya llama a `datos_conductor`.
- El conductor sólo emite con un viaje `aceptada`/`en_curso`; fuera de eso `ubic_*` está en null.

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Migración.** Escribir y ejecutar `supabase/migrations/0005_ubicacion_conductor.sql`: columnas `ubic_lat`/`ubic_lng`/`ubic_at` en `profiles`; `datos_conductor` ampliada con las tres columnas de ubicación (drop + create por el cambio de firma); y limpieza de `ubic_*` dentro de `finalizar_viaje`, `bajarse_viaje` y `cancelar_viaje`. *Verificación:* en el dashboard existen las tres columnas nuevas; `datos_conductor` devuelve las columnas de ubicación; ejecutar una finalización/cancelación deja `ubic_*` en null.

2. **Tipos + constante.** Extender `lib/supabase/types.ts` (`ubic_*` en `Profile` y en `ConductorPublico`) y agregar `UBIC_TTL_S = 30` en `lib/despacho.ts`. *Verificación:* `npm run lint` pasa.

3. **Server Action `reportarUbicacion`.** En `app/actions/conductor.ts`: `reportarUbicacion(lat: number, lng: number)` que valida sesión + rol conductor y hace el self-update de `profiles` (`ubic_lat`, `ubic_lng`, `ubic_at = now()`). Sin `revalidatePath` (no cambia UI del propio conductor). *Verificación:* `npm run build` compila; llamada manual actualiza las columnas del perfil.

4. **Emisión + gate de permiso en `/conducir`.** En `app/conducir/panel-conductor.tsx`:
   - **Gate:** al aparecer una oferta, consultar/solicitar el permiso de geolocalización (`navigator.permissions` + `getCurrentPosition`). Si no está concedido, **Aceptar** queda deshabilitado con un texto/botón "Permitir ubicación"; **Rechazar** sigue disponible.
   - **watchPosition:** cuando el conductor tiene un viaje `aceptada`/`en_curso`, iniciar `navigator.geolocation.watchPosition()`; cada fix se acota a `POLL_MS` (~5s) antes de llamar a `reportarUbicacion(lat, lng)`. Detener el watch (`clearWatch`) cuando ya no hay viaje activo o se desmonta el panel.
   *Verificación:* aceptando un viaje, las columnas `ubic_*` del conductor se actualizan cada ~5s; sin permiso concedido no se puede aceptar.

5. **Mapa en `/conducir` con viaje activo.** Extender/reutilizar `app/viajar/mapa.tsx` (o un componente hermano) para aceptar un marcador de conductor opcional con ícono distinguible. En el panel, durante `aceptada`/`en_curso`, renderizar el mapa con la posición actual del conductor + origen y destino del viaje. *Verificación:* con un viaje activo, `/conducir` muestra el mapa con el auto del conductor y los puntos del viaje.

6. **Consumo + marcador en `/viajar`.** `estadoViajeActivo` ya trae `conductor` vía `datos_conductor`; ahora ese objeto incluye `ubic_*`. En `app/viajar/viaje-pendiente.tsx`, durante `aceptada`/`en_curso`, renderizar el mapa con origen, destino y el marcador del conductor cuando la posición está **vigente** (`ubic_at > now() - UBIC_TTL_S` y coords no nulas); si no, mostrar "Ubicando al conductor…". El marcador se refresca en el `tick` de 5s existente. *Verificación:* con el conductor emitiendo, el pasajero ve el marcador moverse; si el conductor pierde señal >30s, aparece "Ubicando al conductor…".

7. **Ciclo completo end-to-end.** Con dos sesiones (pasajero y conductor): solicitar → oferta → (sin permiso no se puede aceptar) → conceder permiso → aceptar → el pasajero ve el marcador moverse → iniciar → seguir viendo el marcador → finalizar (se limpia `ubic_*`, desaparece el mapa). Probar además: bajarse tras aceptar y cancelar del pasajero, verificando que en ambos casos `ubic_*` queda en null. *Verificación:* todos los caminos dejan `profiles.ubic_*` consistente y ambos mapas reflejan la posición por polling.

## Criterios de aceptación

- [ ] Existen en Supabase las columnas `profiles.ubic_lat`, `profiles.ubic_lng` y `profiles.ubic_at`.
- [ ] La RPC `datos_conductor` devuelve, además de nombre + vehículo, `ubic_lat`, `ubic_lng` y `ubic_at` del conductor asignado, y sólo para el pasajero dueño del viaje.
- [ ] En `/conducir`, si el permiso de geolocalización no está concedido, el botón **Aceptar** de una oferta está deshabilitado y se muestra un pedido de permiso; **Rechazar** sigue disponible.
- [ ] Con el permiso concedido, **Aceptar** funciona normal y el conductor pasa al viaje asignado.
- [ ] Al aceptar un viaje, el conductor emite su posición: `profiles.ubic_*` se actualiza aproximadamente cada `POLL_MS` (~5s) mientras el viaje está `aceptada`/`en_curso`, sin escribir en cada fix del GPS.
- [ ] Durante `aceptada`/`en_curso`, `/conducir` muestra un mapa con la posición del conductor más el origen y el destino del viaje.
- [ ] Durante `aceptada`/`en_curso`, `/viajar` muestra un mapa con origen, destino y el marcador del conductor, que se mueve por polling (~5s) sin recargar la página.
- [ ] Si la posición del conductor no está vigente (coords nulas o `ubic_at` anterior a `now() - UBIC_TTL_S`), el pasajero ve "Ubicando al conductor…" en vez de un marcador viejo.
- [ ] **Finalizar** un viaje limpia `profiles.ubic_*` del conductor (quedan en null) y el mapa deja de mostrarse en ambas vistas.
- [ ] **Bajarse** tras aceptar y **Cancelar** del pasajero también dejan `profiles.ubic_*` del conductor en null.
- [ ] El conductor no comparte ubicación cuando está ocioso (sin viaje activo): `watchPosition` sólo corre con un viaje `aceptada`/`en_curso`.
- [ ] RLS/seguridad: un pasajero sólo obtiene la ubicación del conductor de **su** viaje activo; no hay forma de leer `ubic_*` de conductores ajenos.
- [ ] Se mantienen los gates y el flujo del Spec 05: solicitar → oferta → aceptar → iniciar → finalizar, con el despacho 1×1 intacto.
- [ ] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** posición desde el navegador con `navigator.geolocation.watchPosition()` en `/conducir`. **No:** una fuente externa o simulada. Es la única fuente real de la posición del conductor en una PWA; sin dispositivo del conductor no hay ubicación en vivo.
- **Sí:** el conductor **no puede aceptar** sin **compartir una ubicación en tiempo real obtenida en el momento** (botón "Compartir mi ubicación" → `getCurrentPosition`); cada oferta exige un fix fresco. **No:** habilitar Aceptar sólo porque el permiso ya estaba concedido de antes (más débil: no garantiza que haya una posición real). Compartir la ubicación es parte del contrato del viaje para el pasajero; si no va a haberla, mejor que ese conductor no tome el viaje (otro candidato lo hará).
- **Sí:** guardar sólo el **último punto** en columnas `ubic_*` de `profiles`. **No:** tabla `driver_locations` con historial de recorrido. Necesitamos "dónde está ahora", no la traza; un solo punto por conductor es coherente con `last_seen_at` y no amerita tabla propia todavía.
- **Sí:** compartir la posición **sólo entre aceptar y finalizar** el viaje, y **borrarla** al cerrar/soltar. **No:** emitir siempre que `/conducir` esté abierto. Privacidad: el conductor comparte su ubicación con un pasajero concreto por el tiempo del viaje, no de forma permanente.
- **Sí:** **polling** (~5s), reusando el `tick` que ya trae `datos_conductor`. **No:** Supabase Realtime. Mantiene la consistencia con todo el proyecto y evita el salto de complejidad que el Spec 05 dejó explícitamente para otro spec; la ubicación viaja gratis en el request que ya se hace.
- **Sí:** escribir la posición **acotada a ~5s** (`POLL_MS`) aunque el GPS dé más fixes. **No:** escribir en cada callback de `watchPosition`. Evita spamear la DB con updates sub-segundo sin ganancia visible (el pasajero refresca cada 5s de todos modos).
- **Sí:** ampliar la RPC existente `datos_conductor` con las columnas de ubicación. **No:** una RPC nueva `ubicacion_conductor`. Un solo viaje de ida y vuelta trae vehículo + posición juntos; la validación `pasajero_id = auth.uid()` de esa función ya protege la lectura.
- **Sí:** frescura (~30s) calculada **en el servidor** (RPC `datos_conductor` devuelve el booleano `ubic_vigente`) y escritura con `now()` del servidor (RPC `reportar_ubicacion`). **No:** timestamp de cliente comparado contra el reloj del pasajero. Evita que el skew entre relojes de dos dispositivos distintos congele u oculte el marcador; el pasajero sólo renderiza el flag. *(Ajuste post-review; ver Notas de implementación.)*
- **Sí:** ante posición vieja/ausente, mostrar "Ubicando al conductor…". **No:** mostrar el último punto conocido aunque esté viejo. Un marcador viejo miente sobre dónde está el conductor; es peor que no mostrar nada.
- **Sí:** **sólo marcador** del conductor, sin re-ruteo. **No:** recalcular la ruta del conductor al punto de encuentro en cada refresco. El re-ruteo en vivo implica llamar a OSRM en cada tick y es un spec propio (ETA/ruteo dinámico).
- **Sí:** mapa también en `/conducir` durante el viaje activo (posición + origen/destino). **No:** que el conductor sólo emita a ciegas. Le da contexto de a dónde ir sin costo adicional (reusa el componente de mapa).
- **Sí:** el marcador **salta** de punto a punto entre fixes. **No:** interpolación/animación suave. Simplifica el MVP; el suavizado es puramente cosmético.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El conductor niega o revoca el permiso de ubicación después de aceptar (lo concede, acepta, y luego lo revoca en pleno viaje). | El pasajero deja de ver marcador y cae a "Ubicando al conductor…" cuando el servidor deja de marcar `ubic_vigente`; el viaje sigue operativo (aceptar/iniciar/finalizar no dependen de la ubicación). El gate sólo bloquea *aceptar*, no el resto del ciclo. |
| La precisión del GPS del navegador es baja (sobre todo en desktop, que geolocaliza por IP): el marcador puede aparecer lejos de la posición real. | Aceptable para el MVP; es un problema del dispositivo, no de la app. En móvil con GPS real la precisión es buena. No mostramos precisión en la UI para no dar falsa exactitud. |
| `watchPosition` sigue corriendo si el componente no lo limpia, drenando batería o emitiendo tras finalizar. | El watch se inicia sólo con viaje `aceptada`/`en_curso` y se detiene (`clearWatch`) en el cleanup del `useEffect` cuando deja de haber viaje activo o se desmonta el panel. |
| El navegador pausa timers/geolocalización en pestañas en segundo plano (móvil con pantalla apagada): la posición deja de refrescarse. | Al reactivar la pestaña, el watch retoma y el próximo tick del pasajero vuelve a ver el marcador; mientras tanto el pasajero ve "Ubicando al conductor…". Sin impacto de corrección. |
| La escritura acotada a ~5s puede quedar desfasada del refresco del pasajero (también ~5s), sumando hasta ~10s de latencia percibida. | Aceptable: son metros de diferencia a velocidad urbana. Los intervalos son independientes y el marcador converge en el siguiente ciclo. |
| La limpieza de `ubic_*` vive en tres RPC (`finalizar`, `bajarse`, `cancelar`); si una rama de cierre no la incluye, queda un punto "colgado" entre viajes. | Cubrir las tres rutas de cierre en la migración y verificarlo en el paso end-to-end (criterio de aceptación explícito para las tres). El TTL de frescura acota el daño: un punto colgado igual caduca a los 30s. |
| Fuga de ubicación: que un usuario lea la posición de un conductor que no es el de su viaje. | `datos_conductor` es `security definer` y valida `pasajero_id = auth.uid()`; sólo devuelve la posición del conductor asignado al viaje del propio pasajero. Fuera de un viaje activo, `ubic_*` está en null. |

## Notas de implementación

Ajustes respecto del diseño original, hechos durante la implementación y el review:

- **Frescura server-side (migración `0006`).** El diseño original escribía `ubic_at` desde la Server Action (reloj del cliente) y evaluaba la frescura en el pasajero contra su propio reloj (`UBIC_TTL_S` en TS). Como eran dos dispositivos distintos, el skew entre relojes podía congelar u ocultar el marcador. Se movió todo al servidor: `reportar_ubicacion` escribe `now()` y `datos_conductor` devuelve un booleano `ubic_vigente`. La constante `UBIC_TTL_S` en `lib/despacho.ts` se eliminó (los 30s viven sólo en SQL). En consecuencia, `ConductorPublico` expone `ubic_vigente: boolean` en vez de `ubic_at`.
- **Gate reforzado a "ubicación en tiempo real".** El gate no bloquea sólo por permiso: exige un fix real obtenido en el momento (botón "Compartir mi ubicación"), reseteado por oferta para que cada una requiera una posición fresca.
- **Encuadre del mapa.** `mapa.tsx` reencuadra para mantener visible al marcador del conductor cuando queda fuera del cuadro (no sólo origen/destino). Los `fitBounds`/`setView` usan `animate: false` para no dejar una animación de Leaflet en vuelo cuando el mapa se desmonta al finalizar el viaje (evita el crash `_leaflet_pos`).

## Lo que **no** entra en este spec

- Ruteo en vivo del conductor hacia el punto de encuentro o el destino (línea que se recalcula).
- ETA dinámico calculado desde la posición del conductor.
- Supabase Realtime; el refresco sigue por polling.
- Historial de recorrido / traza del viaje.
- Compartir la ubicación del conductor cuando está ocioso.
- Ubicación del pasajero compartida al conductor.
- Heading, velocidad o precisión del GPS en la UI.
- Suavizado/animación del marcador entre fixes.

Cada uno de esos, si aterriza, va en su propio spec.
