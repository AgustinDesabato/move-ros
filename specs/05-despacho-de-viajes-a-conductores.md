# SPEC 05 — Despacho de viajes a conductores

> **Estado:** Implementado
> **Depende de:** SPEC 01, SPEC 02, SPEC 03, SPEC 04
> **Fecha:** 2026-07-21
> **Objetivo:** Que un viaje `pendiente` se ofrezca automáticamente a los conductores activos de a uno por vez (despacho 1×1 con ofertas que expiran ~20s y presencia por heartbeat), y que el conductor pueda aceptarlo, iniciarlo y finalizarlo, recorriendo el ciclo completo `pendiente → aceptada → en_curso → finalizada`.

Este spec cierra el lazo abierto por el Spec 04: los viajes `pendiente` que crea el pasajero ahora se despachan a conductores. Introduce el despacho dirigido 1×1 (una oferta a la vez, con vencimiento y avance perezoso en cada poll), la presencia del conductor por *heartbeat*, la tabla de ofertas `trip_offers`, la ampliación del enum `trip_status` con `aceptada`/`en_curso`/`finalizada`, y la primera pantalla operativa de `/conducir`. La lógica de matching vive en funciones Postgres `security definer` llamadas por RPC. El seguimiento de ubicación en vivo del conductor queda fuera de alcance.

## Alcance

**Incluye:**

- Migración SQL `supabase/migrations/0004_despacho_conductores.sql`:
  - Ampliar el enum `trip_status` con `aceptada`, `en_curso`, `finalizada` (idempotente).
  - Enum nuevo `offer_status` (`ofrecida`, `aceptada`, `rechazada`, `vencida`) y tabla `trip_offers` (una fila por oferta a un conductor), con RLS e índices.
  - Columna `trips.conductor_id` (conductor asignado, nullable) y columna `profiles.last_seen_at` (presencia por heartbeat).
  - Policies de RLS nuevas para que el conductor vea el viaje que se le ofreció/aceptó y sus propias ofertas.
  - Funciones Postgres `security definer` (RPC): `despachar_viaje`, `aceptar_oferta`, `rechazar_oferta`, `iniciar_viaje`, `finalizar_viaje`, `bajarse_viaje`; y extender la cancelación del pasajero para permitir cancelar en `aceptada`.
- **Despacho 1×1 con avance perezoso:** el poll del pasajero sobre su viaje `pendiente` actúa de reloj del despacho (llama a `despachar_viaje`), que expira la oferta vencida y ofrece al siguiente conductor candidato.
- **Presencia por heartbeat:** el poll de `/conducir` actualiza `last_seen_at`; se considera candidato al conductor con perfil completo y `last_seen_at` reciente (~30s), excluyendo a quienes ya rechazaron o dejaron vencer ese viaje.
- **Server Actions del conductor** (`app/actions/conductor.ts`): `heartbeat`, `ofertaActual`, `aceptarOferta`, `rechazarOferta`, `iniciarViaje`, `finalizarViaje`, `bajarseViaje`.
- **Pantalla `/conducir` operativa:** reemplaza el placeholder. Con polling (~5s): si hay oferta activa, muestra origen/destino/distancia/tarifa con **Aceptar**/**Rechazar** y una cuenta regresiva; una vez aceptada, muestra el viaje activo con **Iniciar**, **Finalizar** y **Bajarme**.
- **Vista del pasajero con polling en `/viajar`:** `viaje-pendiente.tsx` pasa a consultar el estado (~5s) y refleja `aceptada` (nombre + vehículo + patente del conductor, "tu conductor está en camino"), `en_curso` ("viaje en curso") y `finalizada` (resumen y cierre). El pasajero puede **Cancelar** mientras esté `pendiente` o `aceptada`.
- **Server Action del pasajero** (`app/actions/viaje.ts`, extendida): `estadoViajeActivo` que dispara `despachar_viaje` y devuelve el viaje + datos del conductor asignado; `cancelarViaje` ampliada a `aceptada`.
- Constantes compartidas de despacho (TTL de oferta 20s, ventana de presencia 30s, intervalo de poll 5s).

**Fuera de alcance (para specs futuros):**

- Seguimiento de ubicación en vivo del conductor en el mapa del pasajero.
- Toggle explícito de disponibilidad (en línea / fuera de línea) del conductor; la presencia es sólo implícita por heartbeat.
- Matching por cercanía/geolocalización del conductor (el orden es por antigüedad, sin distancia).
- Realtime por suscripción (Supabase Realtime); acá el refresco es por polling.
- Pago o cobro real; la tarifa sigue siendo una estimación.
- Calificaciones, historial de viajes, chat pasajero–conductor.
- Reintentos/timeout automático que cancele un viaje que nadie acepta (queda `pendiente` hasta que el pasajero cancele).
- Notificaciones push; el conductor se entera al tener `/conducir` abierto (poll).
- Background jobs / cron para expirar ofertas; el avance es perezoso en el poll del pasajero.

## Modelo de datos

Migración `supabase/migrations/0004_despacho_conductores.sql`. Idempotente (segura de re-ejecutar).

### Ampliación del enum `trip_status`

Se agregan tres valores. `add value if not exists` es idempotente nativamente; **no** puede usarse el valor nuevo en la misma transacción que lo crea (por eso va suelto, antes de las funciones que lo referencian).

```sql
alter type public.trip_status add value if not exists 'aceptada';
alter type public.trip_status add value if not exists 'en_curso';
alter type public.trip_status add value if not exists 'finalizada';
```

Ciclo de estados resultante:

```
pendiente ──acepta──▶ aceptada ──inicia──▶ en_curso ──finaliza──▶ finalizada
    │                     │
    └──cancela────────────┴──cancela──▶ cancelada
                          │
                     (conductor se baja) ──▶ vuelve a pendiente
```

### Enum `offer_status` + tabla `trip_offers`

Una fila por oferta hecha a un conductor para un viaje.

```sql
do $$ begin
  if not exists (select 1 from pg_type where typname = 'offer_status') then
    create type public.offer_status as enum ('ofrecida', 'aceptada', 'rechazada', 'vencida');
  end if;
end$$;

create table if not exists public.trip_offers (
  id            uuid               primary key default gen_random_uuid(),
  trip_id       uuid               not null references public.trips (id)      on delete cascade,
  conductor_id  uuid               not null references public.profiles (id)   on delete cascade,
  estado        public.offer_status not null default 'ofrecida',
  expira_at     timestamptz        not null,   -- created_at + 20s
  created_at    timestamptz        not null default now()
);

-- Oferta activa por viaje (a lo sumo una 'ofrecida' vigente); y exclusión de candidatos.
create index if not exists trip_offers_trip_estado_idx on public.trip_offers (trip_id, estado);
create index if not exists trip_offers_conductor_estado_idx on public.trip_offers (conductor_id, estado);
```

Convención de la oferta activa: la fila con `estado = 'ofrecida'` y `expira_at > now()`. Candidatos **excluidos** de un viaje: conductores con una fila `rechazada` o `vencida` para ese `trip_id`.

### Columnas nuevas en tablas existentes

```sql
-- Conductor asignado al viaje (null hasta que alguien acepta).
alter table public.trips
  add column if not exists conductor_id uuid references public.profiles (id);

-- Presencia del conductor: el heartbeat del poll de /conducir la actualiza.
alter table public.profiles
  add column if not exists last_seen_at timestamptz;
```

### RLS nueva

`trip_offers` con RLS; el conductor ve/gestiona sólo sus ofertas (las escrituras reales van por las funciones `security definer`, así que alcanza con `select`). El pasajero ve las ofertas de sus viajes.

```sql
alter table public.trip_offers enable row level security;

drop policy if exists "El conductor ve sus ofertas" on public.trip_offers;
create policy "El conductor ve sus ofertas"
  on public.trip_offers for select
  using ( auth.uid() = conductor_id );

drop policy if exists "El pasajero ve las ofertas de sus viajes" on public.trip_offers;
create policy "El pasajero ve las ofertas de sus viajes"
  on public.trip_offers for select
  using ( exists (select 1 from public.trips t
                  where t.id = trip_offers.trip_id and t.pasajero_id = auth.uid()) );
```

Ampliar el `select` de `trips` para que el conductor vea el viaje que se le ofreció o que aceptó (la policy del pasajero del Spec 04 se mantiene):

```sql
drop policy if exists "El conductor ve viajes ofrecidos o asignados" on public.trips;
create policy "El conductor ve viajes ofrecidos o asignados"
  on public.trips for select
  using ( auth.uid() = conductor_id
          or exists (select 1 from public.trip_offers o
                     where o.trip_id = trips.id and o.conductor_id = auth.uid()) );
```

El conductor actualiza su propia presencia (self-update de `profiles`); si la policy de update de `profiles` del Spec 01/02 ya cubre `auth.uid() = id`, no se agrega nada. Las transiciones de estado del viaje **no** se hacen por update directo del conductor: van por RPC `security definer`.

### Funciones Postgres (RPC, `security definer`)

Toda la lógica de despacho y transición vive acá, atómica y con `search_path` fijo. Firmas:

| Función | Quién | Qué hace |
| --- | --- | --- |
| `despachar_viaje(p_trip_id uuid)` | pasajero (su viaje) | Si el viaje está `pendiente`: marca `vencida` la oferta expirada; si no hay oferta activa, elige el siguiente candidato (conductor con perfil completo, `last_seen_at > now()-30s`, no excluido) por antigüedad e inserta `trip_offers` (`ofrecida`, `expira_at = now()+20s`). |
| `aceptar_oferta(p_trip_id uuid)` | conductor | Si tiene una oferta `ofrecida` vigente y el viaje sigue `pendiente`: marca la oferta `aceptada`, setea `trips.conductor_id = auth.uid()` y `estado = 'aceptada'`. Condicional (evita carrera de dos aceptaciones). |
| `rechazar_oferta(p_trip_id uuid)` | conductor | Marca su oferta `ofrecida` como `rechazada` y llama a `despachar_viaje` para ofrecer al siguiente. |
| `iniciar_viaje(p_trip_id uuid)` | conductor asignado | `aceptada → en_curso` si `conductor_id = auth.uid()`. |
| `finalizar_viaje(p_trip_id uuid)` | conductor asignado | `en_curso → finalizada` si `conductor_id = auth.uid()`. |
| `bajarse_viaje(p_trip_id uuid)` | conductor asignado | Desde `aceptada`: marca su oferta `rechazada`, limpia `conductor_id`, vuelve el viaje a `pendiente` (será re-despachado, excluyéndolo). |
| `cancelar_viaje(p_trip_id uuid)` | pasajero | Extiende el Spec 04: permite `pendiente`/`aceptada → cancelada`. Vencer/cerrar ofertas activas del viaje. |

Todas validan el rol/propiedad con `auth.uid()` y son idempotentes ante estados que no corresponden (no-op si el viaje ya cambió de estado).

### Tipos TypeScript (`lib/supabase/types.ts`, extendiendo lo anterior)

```ts
export type TripStatus =
  | "pendiente" | "aceptada" | "en_curso" | "finalizada" | "cancelada";

export type OfferStatus = "ofrecida" | "aceptada" | "rechazada" | "vencida";

// Trip gana conductor_id
export type Trip = {
  // …campos del Spec 04…
  conductor_id: string | null;
  estado: TripStatus;
};

// Profile gana last_seen_at
export type Profile = {
  // …campos previos…
  last_seen_at: string | null;
};

export type TripOffer = {
  id: string;
  trip_id: string;
  conductor_id: string;
  estado: OfferStatus;
  expira_at: string;
  created_at: string;
};

// Lo que ve el pasajero cuando su viaje está aceptado/en curso
export type ConductorPublico = {
  nombre: string | null;
  marca: string;
  modelo: string;
  patente: string;
  color: string;
};
```

### Constantes de despacho (`lib/despacho.ts`)

```ts
export const OFERTA_TTL_S = 20;      // vida de una oferta 1×1
export const PRESENCIA_TTL_S = 30;   // ventana de "conductor activo"
export const POLL_MS = 5000;         // intervalo de polling (ambas vistas)
```

Los 20s y 30s viven como literales dentro de las funciones SQL (fuente de verdad del lado servidor); en TS se replican sólo para la cuenta regresiva y el intervalo de la UI.

**Convenciones:**

- La oferta activa de un viaje es a lo sumo una: `trip_offers` con `estado='ofrecida'` y `expira_at > now()`.
- El reloj del despacho es el poll del pasajero: mientras el pasajero espera, `despachar_viaje` avanza las ofertas. El poll del conductor sólo hace *heartbeat* y lee su oferta actual; no escanea el pool.
- Las transiciones de estado del viaje pasan siempre por RPC `security definer`, nunca por update directo del cliente.

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Migración.** Escribir y ejecutar `supabase/migrations/0004_despacho_conductores.sql`: ampliación del enum `trip_status`, enum `offer_status`, tabla `trip_offers` (RLS + índices), columnas `trips.conductor_id` y `profiles.last_seen_at`, policies nuevas (`trip_offers`, `select` de conductor en `trips`) y las funciones `security definer` (`despachar_viaje`, `aceptar_oferta`, `rechazar_oferta`, `iniciar_viaje`, `finalizar_viaje`, `bajarse_viaje`, `cancelar_viaje`). *Verificación:* en el dashboard existen el enum ampliado, `offer_status`, la tabla `trip_offers` con sus policies, las columnas nuevas y las funciones.

2. **Tipos + constantes.** Extender `lib/supabase/types.ts` (`TripStatus`, `OfferStatus`, `TripOffer`, `conductor_id` en `Trip`, `last_seen_at` en `Profile`, `ConductorPublico`) y crear `lib/despacho.ts` (`OFERTA_TTL_S`, `PRESENCIA_TTL_S`, `POLL_MS`). *Verificación:* `npm run lint` pasa.

3. **Server Actions del conductor.** Crear `app/actions/conductor.ts` (`"use server"`), cada una validando sesión y rol conductor:
   - `heartbeat()`: `update profiles set last_seen_at = now() where id = auth.uid()`.
   - `ofertaActual()`: devuelve la oferta `ofrecida` vigente del conductor junto con el viaje (origen/destino/distancia/duración/tarifa) y su `expira_at`; `null` si no hay.
   - `aceptarOferta(tripId)`, `rechazarOferta(tripId)`, `iniciarViaje(tripId)`, `finalizarViaje(tripId)`, `bajarseViaje(tripId)`: cada una llama a su RPC homónima vía `supabase.rpc(...)` y hace `revalidatePath('/conducir')`.

   *Verificación:* `npm run build` compila sin errores de tipo.

4. **Server Action de estado del pasajero.** En `app/actions/viaje.ts`: agregar `estadoViajeActivo()` que, para el viaje activo del pasajero (no `finalizada`/`cancelada`), llama a `despachar_viaje` (RPC) cuando está `pendiente` y devuelve `{ trip, conductor }` donde `conductor` es `ConductorPublico | null` (join a `profiles`+`vehicles` cuando hay `conductor_id`). Extender `cancelarViaje` para aceptar el estado `aceptada`. *Verificación:* `npm run build` compila; llamar la action desde un viaje `pendiente` inserta una fila en `trip_offers`.

5. **Pantalla `/conducir`.** `app/conducir/page.tsx` mantiene el gate (sesión + rol conductor + perfil completo) y renderiza un client component nuevo `app/conducir/panel-conductor.tsx`:
   - Con `useEffect` + `setInterval(POLL_MS)`: llama a `heartbeat()` y `ofertaActual()`.
   - Si hay oferta: tarjeta con origen → destino, distancia/tiempo/tarifa, cuenta regresiva hasta `expira_at`, y botones **Aceptar** (`aceptarOferta`) / **Rechazar** (`rechazarOferta`).
   - Si el conductor tiene un viaje asignado (`aceptada`/`en_curso`): tarjeta del viaje con **Iniciar** (`iniciarViaje`) / **Finalizar** (`finalizarViaje`) / **Bajarme** (`bajarseViaje`).
   - Si no hay nada: "Esperando viajes…". Conservar links a `/perfil` y logout.

   *Verificación:* con un pasajero solicitando un viaje y un conductor activo en `/conducir`, al conductor le aparece la oferta y puede aceptarla; la vista pasa al viaje asignado.

6. **Vista del pasajero con polling.** Convertir `app/viajar/viaje-pendiente.tsx` en client component que con `setInterval(POLL_MS)` llama a `estadoViajeActivo()` y renderiza según `trip.estado`:
   - `pendiente`: "Buscando conductor…" + **Cancelar** (como Spec 04, pero ahora refrescando).
   - `aceptada`: datos del conductor (nombre + `marca modelo`, patente, color), "Tu conductor está en camino" + **Cancelar**.
   - `en_curso`: "Viaje en curso".
   - `finalizada`: resumen ("Viaje finalizado", tarifa) y opción de volver al selector.

   Ajustar `app/viajar/page.tsx` para tratar `aceptada`/`en_curso` (además de `pendiente`) como "viaje activo" que muestra `viaje-pendiente.tsx` en vez del selector. *Verificación:* al aceptar el conductor, `/viajar` pasa sola (sin recargar) a "Tu conductor está en camino" con los datos del auto; al finalizar, vuelve el selector.

7. **Ciclo completo end-to-end.** Recorrer el flujo con dos sesiones (pasajero y conductor): solicitar → oferta → aceptar → iniciar → finalizar; y los caminos alternativos: rechazar (pasa al siguiente candidato), dejar vencer la oferta, bajarse tras aceptar (vuelve a `pendiente`), cancelar del pasajero en `pendiente` y en `aceptada`. *Verificación:* todos los caminos dejan estados consistentes en `trips`/`trip_offers` y ambas vistas reflejan el estado por polling.

## Criterios de aceptación

- [ ] Existen en Supabase: el enum `trip_status` ampliado con `aceptada`/`en_curso`/`finalizada`, el enum `offer_status`, la tabla `trip_offers` con sus policies e índices, las columnas `trips.conductor_id` y `profiles.last_seen_at`, y las funciones `despachar_viaje`, `aceptar_oferta`, `rechazar_oferta`, `iniciar_viaje`, `finalizar_viaje`, `bajarse_viaje` y `cancelar_viaje`.
- [ ] Un pasajero con un viaje `pendiente` cuyo `/viajar` está abierto genera, vía polling, una oferta (`trip_offers` `ofrecida`) a un conductor activo, con `expira_at` ≈ 20s después de `created_at`.
- [ ] Sólo se ofrece a conductores con perfil completo y `last_seen_at` dentro de los ~30s; un conductor sin `/conducir` abierto (heartbeat viejo) no recibe ofertas.
- [ ] En `/conducir`, a un conductor activo con una oferta vigente le aparece la tarjeta con origen/destino, distancia, tiempo y tarifa, y una cuenta regresiva.
- [ ] **Aceptar** deja el viaje en `aceptada` con `conductor_id` = ese conductor y la oferta en `aceptada`; dos conductores no pueden aceptar el mismo viaje (el segundo intento es no-op).
- [ ] **Rechazar** marca la oferta `rechazada` y el viaje se ofrece al siguiente candidato, sin volver a ofrecerse al que rechazó.
- [ ] Una oferta que expira sin respuesta se marca `vencida` en el siguiente `despachar_viaje` y el viaje pasa al siguiente candidato; el conductor que la dejó vencer queda excluido de ese viaje.
- [ ] Si no hay conductores activos elegibles, el viaje permanece `pendiente` sin oferta activa y el pasajero sigue viendo "Buscando conductor…".
- [ ] Con el viaje `aceptada`, `/viajar` muestra (por polling, sin recargar) el nombre del conductor, `marca modelo`, patente y color.
- [ ] **Iniciar** pasa el viaje a `en_curso` y **Finalizar** a `finalizada`, reflejándose en ambas vistas; sólo el conductor asignado puede hacerlo.
- [ ] **Bajarme** desde `aceptada` limpia `conductor_id`, vuelve el viaje a `pendiente` y lo re-despacha excluyendo a ese conductor.
- [ ] El pasajero puede **Cancelar** en `pendiente` y en `aceptada`; el viaje queda `cancelada` y desaparece de `/conducir` para el conductor.
- [ ] RLS: un conductor sólo ve el viaje que se le ofreció o que tiene asignado (no el pool completo ni viajes de otros); un pasajero sólo ve/cancela sus propios viajes.
- [ ] Se mantienen los gates previos: sin sesión → `/login`; perfil incompleto → `/perfil`; rol equivocado redirige (`pasajero` en `/conducir` → `/viajar`, `conductor` en `/viajar` → `/conducir`).
- [ ] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** despacho dirigido 1×1 (una oferta a la vez, con vencimiento). **No:** tablero compartido donde cualquier conductor toma cualquier viaje. El 1×1 se parece más a cómo opera una app de viajes real y evita la "carrera de clicks" por un mismo viaje.
- **Sí:** avance perezoso del despacho en el poll del pasajero (`despachar_viaje` en cada consulta). **No:** cron / background job para expirar ofertas — este stack no los tiene. El pasajero que espera es un reloj natural y suficiente para el MVP.
- **Sí:** presencia implícita por *heartbeat* (`last_seen_at` que refresca el poll de `/conducir`). **No:** toggle explícito de "en línea/fuera de línea". Menos superficie de UI y de estado; estar en `/conducir` ya expresa disponibilidad.
- **Sí:** la lógica de matching en funciones Postgres `security definer` llamadas por RPC. **No:** hacerla en Server Actions con `service-role key` — esa clave no está configurada (`.env.local` sólo tiene URL + publishable key) y en la DB el matching corre atómico, evitando carreras y la gimnasia de RLS entre filas de distintos conductores.
- **Sí:** tabla `trip_offers` (una fila por oferta, con estado). **No:** columnas sueltas en `trips` + tabla de rechazos. La tabla da la oferta activa, la exclusión de candidatos y un historial auditable en una sola estructura.
- **Sí:** columna `last_seen_at` en `profiles`. **No:** tabla `driver_presence` aparte. Es un solo timestamp por usuario; no amerita tabla propia todavía.
- **Sí:** orden de candidatos por antigüedad, excluyendo a quienes rechazaron/vencieron. **No:** matching por cercanía — requeriría capturar la ubicación del conductor (otro spec).
- **Sí:** ciclo completo `pendiente → aceptada → en_curso → finalizada`, más `cancelada` y el "bajarse" que vuelve a `pendiente`. Cubre el viaje de punta a punta.
- **Sí:** refresco por polling (~5s) en ambas vistas. **No:** Supabase Realtime — mejor UX pero más complejidad; candidato a su propio spec.
- **Sí:** el pasajero ve nombre + vehículo + patente del conductor asignado. **No:** seguimiento de ubicación en vivo del conductor en el mapa (otro spec).
- **Sí:** un viaje que nadie acepta queda `pendiente` hasta que el pasajero cancele. **No:** timeout automático que lo cancele; simplifica el MVP.
- **Sí:** ampliar el enum con `add value if not exists` (idempotente, fuera de transacción que lo use). **No:** recrear el enum o usar `text` con check.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El avance del despacho depende del poll del pasajero: si cierra `/viajar`, las ofertas dejan de avanzar. | Aceptable para el MVP: sin pasajero esperando, no hay urgencia. Al reabrir `/viajar` el poll retoma el despacho. A futuro, un job/cron o Realtime lo haría independiente del cliente. |
| `alter type … add value` no puede usarse en la misma transacción que lo crea; si el runner de migraciones envuelve todo en una transacción, las funciones que referencian los valores nuevos fallarían. | Poner los `add value if not exists` al inicio del archivo y, si hiciera falta, separarlos en su propia ejecución antes de crear las funciones. En Supabase (PG15) `add value` corre en transacción; el valor sólo no puede *usarse* hasta commit. |
| Carrera: dos conductores aceptan casi a la vez, o el pasajero cancela mientras un conductor acepta. | Las transiciones son RPC `security definer` con `update … where estado = 'pendiente'` condicional y bloqueo de fila (`for update`); sólo una gana, el resto es no-op. |
| Un conductor con `/conducir` abierto pero inactivo (AFK) recibe ofertas que deja vencer, demorando el despacho. | La oferta vence en ~20s y se reasigna; el conductor AFK queda excluido de ese viaje. El TTL corto acota la demora por AFK. |
| `security definer` mal acotada podría permitir a un conductor operar viajes ajenos. | Cada función valida `auth.uid()` contra `conductor_id`/oferta vigente y fija `search_path = public`; las escrituras directas siguen bloqueadas por RLS. |
| Presencia por heartbeat depende del intervalo de poll (~5s) vs. ventana (~30s); relojes o pausas de pestaña podrían marcar activo a quien no lo está. | La ventana (30s) es holgada respecto del poll (5s); en el peor caso una oferta se ofrece a alguien que se fue y vence en 20s, reasignándose. Sin impacto de corrección. |
| El pasajero podría intentar transiciones que no le corresponden (iniciar/finalizar). | Esas RPC exigen `conductor_id = auth.uid()`; para el pasajero son no-op. El pasajero sólo puede solicitar y cancelar. |

## Lo que **no** entra en este spec

- Seguimiento de ubicación en vivo del conductor en el mapa del pasajero.
- Toggle explícito de disponibilidad del conductor.
- Matching por cercanía / geolocalización del conductor.
- Realtime por suscripción (Supabase Realtime).
- Pago o cobro real; calificaciones; historial de viajes; chat pasajero–conductor.
- Timeout automático que cancele un viaje que nadie acepta.
- Notificaciones push.
- Background jobs / cron para expirar ofertas.

Cada uno de esos, si aterriza, va en su propio spec.
