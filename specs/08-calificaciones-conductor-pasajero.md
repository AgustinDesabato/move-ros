# SPEC 08 — Calificaciones de conductor y pasajero

> **Estado:** implementado
> **Depende de:** SPEC 01, SPEC 02, SPEC 04, SPEC 05, SPEC 07
> **Fecha:** 2026-07-23
> **Objetivo:** Que, al cerrarse un viaje `finalizada`, tanto el pasajero como el conductor puedan calificarse mutuamente con estrellas (1–5) y un comentario opcional —mediante un prompt que aparece al finalizar y se puede posponer con una ✕, o después desde el historial `/viajes`—, y que el promedio recibido por cada uno se muestre en su perfil, en la tarjeta del conductor durante el viaje y en la oferta de despacho.

Este spec cierra el ciclo del viaje que venía armándose desde el Spec 05: una vez que un viaje pasa a `finalizada`, cada parte puede calificar a la otra. La calificación es **bidireccional y opcional**: al finalizar aparece un prompt (estrellas + comentario) que se puede cerrar con una ✕ y retomar más tarde desde `/viajes`, donde cada viaje `finalizada` sin calificar muestra un botón "Calificar". Las calificaciones viven en una tabla nueva `calificaciones`; el **promedio de estrellas** recibido se expone en el perfil, en la tarjeta del conductor (que ya ve el pasajero) y en la oferta de despacho (para que el conductor vea la reputación del pasajero). El comentario se guarda pero **no** se muestra en ninguna vista todavía; mostrar reseñas, editar calificaciones y calificar cancelados quedan fuera de alcance.

## Alcance

**Incluye:**

- Migración SQL `supabase/migrations/0008_calificaciones.sql` (idempotente):
  - Tabla nueva `public.calificaciones`: una fila por dirección y por viaje (`trip_id`, `autor_id`, `destinatario_id`, `estrellas` 1–5, `comentario` opcional, `created_at`), con unique `(trip_id, autor_id)` — un viaje admite a lo sumo dos calificaciones (pasajero→conductor y conductor→pasajero), y cada quien califica una sola vez.
  - RLS en `calificaciones`: cada usuario puede insertar sólo calificaciones donde él es `autor_id`; puede leer las que dio o recibió. El promedio agregado se sirve por RPC (no por lectura directa de filas ajenas).
  - RPC `calificar_viaje(p_trip_id, p_estrellas, p_comentario)` (`security definer`): valida que el viaje esté `finalizada`, que quien llama sea el pasajero o el conductor de ese viaje, infiere el `destinatario_id` (la contraparte) e inserta la fila. Rechaza estrellas fuera de 1–5 y comentarios de más de 280 caracteres. Idempotente por el unique: si ya calificó, no duplica.
  - RPC `reputacion(p_user_id)` (`security definer`): devuelve `promedio` (numeric, una decimal) y `cantidad` de las calificaciones **recibidas** por ese usuario. Sólo agrega estrellas; nunca expone comentarios ni autores. `cantidad = 0` cuando no tiene ninguna.
  - RPC `datos_conductor(p_trip_id)` recreada: además de nombre + vehículo + ubicación (Spec 06), devuelve `promedio_estrellas` y `cantidad_calificaciones` del conductor.
  - RPC `historial_viajes()` recreada: agrega la columna `ya_calificado boolean` = si el usuario actual ya calificó ese viaje (para que `/viajes` muestre "Calificar" o "Calificado").
- **Tipos TypeScript** (`lib/supabase/types.ts`, extendido): `ConductorPublico` gana `promedio_estrellas`/`cantidad_calificaciones`; `ViajeHistorial` gana `ya_calificado`; se agrega el tipo `Reputacion` (`{ promedio: number | null; cantidad: number }`).
- **Server Action de calificación** (`app/actions/viaje.ts`, extendida): `calificarViaje(tripId, estrellas, comentario)` que llama a la RPC `calificar_viaje`; y `getReputacion(userId)` que llama a `reputacion`.
- **Componente de calificación reutilizable** (`app/viajes/form-calificacion.tsx`): selector de estrellas (1–5) + textarea opcional (máx. 280) + botón "Enviar" + una **✕** para cerrar sin calificar. Es la misma UI para el prompt inmediato y para el botón del historial.
- **Prompt inmediato al finalizar:**
  - En `/viajar` (`viaje-pendiente.tsx`): cuando el viaje del pasajero pasa a `finalizada` y aún no lo calificó, aparece el prompt de calificación del conductor, con ✕ para posponer.
  - En `/conducir` (`panel-conductor.tsx`): cuando el viaje asignado pasa a `finalizada` y aún no lo calificó, aparece el prompt de calificación del pasajero, con ✕ para posponer.
- **Calificar desde el historial** (`app/viajes/fila-viaje.tsx`): cada viaje `finalizada` sin calificar muestra un botón "Calificar" que abre el mismo `form-calificacion`. Si ya lo calificó, muestra "Calificado".
- **Mostrar el promedio recibido:**
  - En el **perfil** (`app/perfil/page.tsx`): el promedio del propio usuario, formateado `★ 4.8 (12)`; "Sin calificaciones aún" si `cantidad = 0`.
  - En la **tarjeta del conductor** que ve el pasajero (`/viajar`): el promedio del conductor, junto al nombre/vehículo (ya viene de `datos_conductor`).
  - En la **oferta de despacho** que ve el conductor (`/conducir`): el promedio del pasajero de esa oferta.
- **Helper de formato de reputación** (`lib/formato.ts`, extendido): `estrellas(rep: Reputacion): string` → `★ 4.8 (12)` o "Sin calificaciones aún".

**Fuera de alcance (para specs futuros):**

- Mostrar los **comentarios** de las calificaciones en algún lado (perfil, historial, reseñas). Se guardan pero no se muestran.
- **Editar o borrar** una calificación ya enviada: es definitiva.
- Calificar viajes **`cancelada`** (u otros estados): sólo se califica `finalizada`.
- Calificación **retroactiva** de viajes cerrados antes de esta migración más allá de lo que ya permite `/viajes` (aparecen como "sin calificar" y se pueden calificar igual).
- Moderación, reporte o baja de calificaciones abusivas.
- Notificaciones ("te calificaron", "calificá tu último viaje") por push o mail.
- Efectos de la reputación sobre el despacho (priorizar/filtrar conductores o pasajeros por estrellas).
- Desglose de la calificación (puntualidad, limpieza, trato) — acá es una sola estrella global.

## Modelo de datos

Migración `supabase/migrations/0008_calificaciones.sql`. Idempotente (segura de re-ejecutar).

### Tabla nueva `calificaciones`

Una fila = una persona calificando a la otra en un viaje. Máximo dos por viaje (una por dirección). El unique `(trip_id, autor_id)` garantiza que cada quien califica ese viaje una sola vez.

```sql
create table if not exists public.calificaciones (
  id              uuid primary key default gen_random_uuid(),
  trip_id         uuid not null references public.trips(id) on delete cascade,
  autor_id        uuid not null references public.profiles(id) on delete cascade,
  destinatario_id uuid not null references public.profiles(id) on delete cascade,
  estrellas       smallint not null check (estrellas between 1 and 5),
  comentario      text check (comentario is null or char_length(comentario) <= 280),
  created_at      timestamptz not null default now(),
  unique (trip_id, autor_id)
);

create index if not exists calificaciones_destinatario_idx
  on public.calificaciones (destinatario_id);
```

Convención: `autor_id` es quien califica, `destinatario_id` la contraparte. `comentario` null = no dejó texto. Una fila no se edita ni se borra (calificación definitiva); el `on delete cascade` sólo limpia si se borra el viaje o el perfil.

### RLS de `calificaciones`

Nadie lee filas ajenas directo: el promedio se sirve agregado por la RPC `reputacion` (que es `security definer`). Las policies directas sólo habilitan lo mínimo:

```sql
alter table public.calificaciones enable row level security;

-- Insertar: sólo calificaciones donde yo soy el autor.
create policy calificaciones_insert on public.calificaciones
  for insert with check (autor_id = auth.uid());

-- Leer: las que di o las que recibí (no las de terceros entre sí).
create policy calificaciones_select on public.calificaciones
  for select using (autor_id = auth.uid() or destinatario_id = auth.uid());
```

*(La validación fuerte —que el viaje esté `finalizada` y que yo sea parte— la hace la RPC `calificar_viaje`, no la policy; la app siempre inserta vía RPC. La policy de insert es la red de seguridad de que nadie firme una calificación a nombre de otro.)*

### RPC `calificar_viaje(p_trip_id, p_estrellas, p_comentario)`

`security definer`. Valida estado y pertenencia, infiere el destinatario y calcula el rol del autor. Idempotente por el unique: si ya calificó, no hace nada (`on conflict do nothing`).

```sql
create or replace function public.calificar_viaje(
  p_trip_id     uuid,
  p_estrellas   smallint,
  p_comentario  text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip   public.trips;
  v_dest   uuid;
begin
  select * into v_trip from public.trips where id = p_trip_id;
  if v_trip.id is null or v_trip.estado <> 'finalizada' then
    raise exception 'viaje inexistente o no finalizado';
  end if;

  -- el autor es el que llama; el destinatario, la contraparte
  if auth.uid() = v_trip.pasajero_id then
    v_dest := v_trip.conductor_id;
  elsif auth.uid() = v_trip.conductor_id then
    v_dest := v_trip.pasajero_id;
  else
    raise exception 'no sos parte de este viaje';
  end if;

  insert into public.calificaciones (trip_id, autor_id, destinatario_id, estrellas, comentario)
  values (p_trip_id, auth.uid(), v_dest, p_estrellas, nullif(trim(p_comentario), ''))
  on conflict (trip_id, autor_id) do nothing;
end;
$$;
```

### RPC `reputacion(p_user_id)`

`security definer`. Devuelve sólo el agregado de estrellas recibidas; nunca comentarios ni quién calificó.

```sql
create or replace function public.reputacion(p_user_id uuid)
returns table (promedio numeric, cantidad integer)
language sql
security definer
set search_path = public
as $$
  select round(avg(estrellas)::numeric, 1) as promedio,
         count(*)::integer                 as cantidad
    from public.calificaciones
   where destinatario_id = p_user_id;
$$;
```

Con cero calificaciones, `avg` da `null` (promedio null) y `cantidad = 0`; la UI muestra "Sin calificaciones aún".

### Cambios en RPC existentes

`datos_conductor(p_trip_id)` — se recrea (`create or replace`) partiendo del cuerpo actual (Spec 06, con nombre + vehículo + ubicación) y se le agregan dos columnas del conductor asignado:

```sql
-- columnas nuevas en el returns / select de datos_conductor:
promedio_estrellas numeric,      -- avg de estrellas recibidas por el conductor (null si 0)
cantidad_calificaciones integer  -- count
```

`historial_viajes()` — se recrea partiendo del cuerpo actual (Spec 07) y suma una columna:

```sql
-- columna nueva en el returns / select de historial_viajes:
ya_calificado boolean  -- exists(select 1 from calificaciones
                       --        where trip_id = t.id and autor_id = auth.uid())
```

### Tipos TypeScript (`lib/supabase/types.ts`, extendido)

```ts
// Promedio de estrellas recibidas por un usuario.
export type Reputacion = {
  promedio: number | null;   // null si cantidad = 0
  cantidad: number;
};

// ConductorPublico (lo que ve el pasajero) gana la reputación del conductor.
export type ConductorPublico = {
  // …campos previos (nombre, vehículo, ubic_*)…
  promedio_estrellas: number | null;
  cantidad_calificaciones: number;
};

// ViajeHistorial gana si el usuario actual ya calificó ese viaje.
export type ViajeHistorial = {
  // …campos previos…
  ya_calificado: boolean;
};
```

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Migración.** Escribir y ejecutar `supabase/migrations/0008_calificaciones.sql`: tabla `calificaciones` + índice, RLS y sus dos policies, RPC `calificar_viaje`, RPC `reputacion`, y `datos_conductor`/`historial_viajes` recreadas con las columnas nuevas. *Verificación (SQL Editor):* insertar una calificación vía `select calificar_viaje(...)` sobre un viaje `finalizada` propio funciona; sobre uno ajeno o no finalizado tira excepción; llamarla dos veces no duplica; `select * from reputacion('<uid>')` devuelve promedio+cantidad; `select * from historial_viajes()` trae `ya_calificado`.

2. **Tipos.** Agregar `Reputacion` y extender `ConductorPublico` y `ViajeHistorial` en `lib/supabase/types.ts`. *Verificación:* `npm run lint` pasa.

3. **Server Actions.** En `app/actions/viaje.ts`: `calificarViaje(tripId, estrellas, comentario)` → RPC `calificar_viaje`; `getReputacion(userId)` → RPC `reputacion` (devuelve `Reputacion`). *Verificación:* `npm run lint` pasa; llamadas tipadas correctamente.

4. **Helper de formato.** En `lib/formato.ts`: `estrellas(rep: Reputacion): string` → `★ 4.8 (12)`, o `"Sin calificaciones aún"` si `cantidad === 0`. *Verificación:* casos con y sin calificaciones devuelven el string esperado.

5. **Componente `form-calificacion`.** `app/viajes/form-calificacion.tsx` (client component): props `tripId`, `contraparte` (nombre a mostrar), `onCerrar`, `onListo`. Selector de 5 estrellas, textarea opcional (contador ≤280), botón "Enviar" (llama `calificarViaje`, deshabilitado si 0 estrellas), y ✕ que dispara `onCerrar`. *Verificación aislada:* montado en `/viajes`, permite elegir estrellas, escribir comentario, enviar y cerrar con ✕.

6. **Calificar desde el historial.** En `app/viajes/fila-viaje.tsx`: si `estado === 'finalizada' && !ya_calificado`, mostrar botón "Calificar" que abre `form-calificacion` (con la `contraparte` de la fila); al enviar, refrescar (`router.refresh()`) para que pase a "Calificado". Si `ya_calificado`, mostrar "Calificado". *Verificación:* un viaje finalizado sin calificar muestra "Calificar", se califica, y tras refrescar muestra "Calificado"; un cancelado no muestra nada.

7. **Prompt inmediato en `/viajar`.** En `viaje-pendiente.tsx`: cuando el viaje pasa a `finalizada` y el pasajero no lo calificó, montar `form-calificacion` (calificar al conductor) como prompt; la ✕ lo cierra sin calificar (queda disponible en `/viajes`). *Verificación:* al finalizar un viaje, al pasajero le aparece el prompt; enviar lo cierra; la ✕ lo pospone y el viaje sigue "sin calificar" en `/viajes`.

8. **Prompt inmediato en `/conducir`.** En `panel-conductor.tsx`: cuando el viaje asignado pasa a `finalizada` y el conductor no lo calificó, montar `form-calificacion` (calificar al pasajero) como prompt, con ✕ para posponer. *Verificación:* al finalizar, al conductor le aparece el prompt para calificar al pasajero.

9. **Promedio en el perfil.** En `app/perfil/page.tsx`: llamar `getReputacion(user.id)` y mostrar `estrellas(rep)` (o "Sin calificaciones aún"). *Verificación:* el perfil muestra el promedio recibido; un usuario nuevo muestra "Sin calificaciones aún".

10. **Promedio del conductor en `/viajar`.** En la tarjeta del conductor de `viaje-pendiente.tsx`: mostrar `promedio_estrellas`/`cantidad_calificaciones` (ya vienen de `datos_conductor`) con `estrellas(...)`. *Verificación:* durante un viaje activo, el pasajero ve el promedio del conductor junto al nombre/vehículo.

11. **Promedio del pasajero en la oferta de despacho.** En `/conducir` (`panel-conductor.tsx` + `ofertaActual`): obtener la reputación del pasajero de la oferta y mostrarla en la tarjeta de oferta. Como el conductor no puede leer el perfil del pasajero por RLS, usar `getReputacion(trip.pasajero_id)` (la RPC `reputacion` es `security definer` y sólo devuelve el agregado). *Verificación:* al llegar una oferta, el conductor ve `★ x.x (n)` del pasajero, o "Sin calificaciones aún".

12. **Prueba end-to-end.** Con dos sesiones: completar un viaje entero (solicitar → aceptar → iniciar → finalizar); verificar que a ambos les aparece el prompt; que uno califica y el otro lo pospone con ✕; que el pospuesto queda en `/viajes` como "Calificar" y se puede calificar ahí; que ambos promedios se actualizan en perfil, tarjeta del conductor y oferta de despacho. *Verificación:* todos los criterios de aceptación.

## Criterios de aceptación

- [x] Existe la tabla `public.calificaciones` con RLS activa y las policies de insert (`autor_id = auth.uid()`) y select (autor o destinatario).
- [x] La RPC `calificar_viaje` inserta una calificación sobre un viaje `finalizada` del que el usuario es parte; el `destinatario_id` es siempre la contraparte.
- [x] `calificar_viaje` rechaza (excepción) calificar un viaje que no está `finalizada`, o uno del que el usuario no es pasajero ni conductor.
- [x] `calificar_viaje` rechaza estrellas fuera de 1–5 y comentarios de más de 280 caracteres.
- [x] Llamar `calificar_viaje` dos veces sobre el mismo viaje y autor no duplica ni pisa la calificación (unique `(trip_id, autor_id)` + `on conflict do nothing`).
- [x] La RPC `reputacion(uid)` devuelve `promedio` a una decimal y `cantidad`; con cero calificaciones devuelve `promedio = null` y `cantidad = 0`.
- [x] Un usuario no puede leer las filas de `calificaciones` entre terceros: sólo las que dio o recibió (verificado por RLS); los comentarios nunca salen por `reputacion`.
- [x] Al pasar un viaje a `finalizada`, al **pasajero** le aparece en `/viajar` el prompt para calificar al conductor, y al **conductor** en `/conducir` el prompt para calificar al pasajero.
- [x] El prompt tiene selector de 1–5 estrellas, comentario opcional (máx. 280) y una ✕ que lo cierra **sin** calificar.
- [x] El botón "Enviar" está deshabilitado con 0 estrellas; el comentario puede quedar vacío.
- [x] Si se cierra el prompt con la ✕, el viaje aparece en `/viajes` con un botón "Calificar"; calificar desde ahí funciona y deja el viaje como "Calificado".
- [x] Un viaje `finalizada` ya calificado por el usuario muestra "Calificado" (no el puntaje que puso) en `/viajes`.
- [x] Los viajes `cancelada` no ofrecen calificar en `/viajes` ni disparan prompt.
- [x] El **perfil** (`/perfil`) muestra el promedio recibido como `★ 4.8 (12)`, o "Sin calificaciones aún" si `cantidad = 0`.
- [x] Durante un viaje activo, el pasajero ve en la tarjeta del conductor su promedio (`★ x.x (n)`), traído por `datos_conductor`.
- [x] Al llegar una oferta de despacho, el conductor ve el promedio del pasajero (`★ x.x (n)` o "Sin calificaciones aún").
- [x] Tras calificar, los promedios reflejan la nueva calificación en perfil, tarjeta del conductor y oferta.
- [x] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** tabla nueva `calificaciones`, una fila por dirección. **No:** columnas `rating_conductor`/`rating_pasajero` en `trips`. La tabla normaliza el comentario, permite agregar el promedio sin ensuciar `trips` y escala si mañana se muestran reseñas. El costo es un `join`/agregado, que la RPC `reputacion` encapsula.
- **Sí:** calificación **bidireccional**. **No:** sólo pasajero→conductor. El título pedía "conductor y pasajero"; que el conductor también califique da simetría y hace útil mostrar la reputación del pasajero en la oferta.
- **Sí:** calificación **opcional** con prompt que se cierra con ✕. **No:** forzar la calificación para poder pedir otro viaje. Obligar molesta y ensucia los datos con calificaciones "de trámite"; el que quiere califica, y el que la pospone la tiene en `/viajes`.
- **Sí:** prompt inmediato al finalizar **más** botón en el historial. **No:** sólo uno de los dos. El prompt captura el momento caliente (recién bajaste), y el historial es la red para el que lo cerró con ✕. Comparten el mismo componente `form-calificacion`, así que no se duplica UI.
- **Sí:** calificación **definitiva** (`on conflict do nothing`). **No:** editar/re-calificar. Es lo típico en apps de viajes y evita toda la UI de edición y el problema de "bajar" una estrella tras una discusión. Editar queda para otro spec si hace falta.
- **Sí:** sólo se califica `finalizada`. **No:** calificar `cancelada`. Un viaje cancelado no ocurrió; no hay experiencia real que puntuar, y calificar cancelaciones abriría disputas.
- **Sí:** el comentario se **guarda pero no se muestra**. **No:** mostrar reseñas ya. Guardarlo desde el día uno evita una migración de datos futura; mostrarlo trae moderación, reporte y una UI de reseñas que son otro spec.
- **Sí:** el promedio se sirve por RPC `reputacion` (`security definer`). **No:** lectura directa de `calificaciones` con una policy de select amplia. El conductor necesita ver el promedio del pasajero (y viceversa) sin poder leer perfiles ajenos ni comentarios; una RPC que devuelve **sólo** `promedio`+`cantidad` es la superficie mínima, igual que `datos_conductor`/`historial_viajes` en specs previos.
- **Sí:** mostrar el promedio del pasajero en la **oferta de despacho**. **No:** sólo en el perfil. Sin verlo en la oferta, la calificación del pasajero no cambia ninguna decisión y sería data muerta; en la oferta el conductor la usa al aceptar/rechazar.
- **Sí:** formato `★ 4.8 (12)` con una decimal. **No:** cinco estrellas rellenadas proporcionalmente. Un número es más legible y barato de renderizar que medias estrellas; el detalle visual queda para después si se quiere.
- **Sí:** "Sin calificaciones aún" para `cantidad = 0`. **No:** un default 5.0 o "—". Un 5.0 fantasma miente sobre la reputación de un usuario nuevo; decir la verdad ("todavía nadie lo calificó") es más honesto y evita inflar promedios.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La RPC `reputacion` es `security definer` y la puede llamar cualquier usuario autenticado con cualquier `p_user_id`: podría usarse para sondear reputaciones ajenas. | Sólo devuelve el **agregado** (`promedio` + `cantidad`), nunca comentarios, autores ni ids de viajes. La reputación es dato público en apps de viajes (el pasajero ya ve la del conductor); exponer sólo el promedio no filtra nada sensible. |
| Un bug en `calificar_viaje` (validación de estado/pertenencia) permitiría calificar viajes ajenos o no finalizados, ensuciando el promedio de un tercero. | La función valida `estado = 'finalizada'` y que `auth.uid()` sea el pasajero o el conductor **antes** de insertar, e infiere el `destinatario_id` del propio viaje (no lo recibe por parámetro). Se verifica en el paso end-to-end que un tercero no puede calificar. |
| Recrear `datos_conductor` e `historial_viajes` podría pisar lo que les sumaron los Specs 06 y 07 (ubicación, contraparte, `cerrado_at`). | La migración `0008` parte del cuerpo **actual** de ambas funciones y sólo **agrega** columnas; se verifica que sigan devolviendo ubicación/`ubic_vigente` (06) y `contraparte`/orden por cierre (07). |
| El prompt inmediato podría reaparecer molesto en cada poll mientras el viaje sigue `finalizada` y aún no se calificó. | El estado del prompt se decide con `ya_calificado` / la reputación local, y la ✕ marca "pospuesto" en el cliente para no re-montarlo en el mismo ciclo de vista; recién vuelve a ofrecerse desde `/viajes`. |
| Doble envío del formulario (doble click, reintento) generaría una segunda inserción. | El unique `(trip_id, autor_id)` + `on conflict do nothing` hacen el segundo envío un no-op; además el botón "Enviar" se deshabilita mientras la Server Action está en vuelo. |
| Viajes `finalizada` **anteriores** a esta migración aparecen de golpe como "sin calificar" y podrían inundar `/viajes` con botones "Calificar". | Es aceptable: son viajes reales del usuario y calificarlos es opcional. No se hace backfill ni se ocultan; si molesta, un spec futuro puede acotar la ventana calificable. |

## Notas de implementación

Ajustes y confirmaciones hechos durante la implementación:

- **Migración manual.** El proyecto no tiene CLI de Supabase vinculado ni connection string (sólo la publishable key en `.env.local`, que no corre DDL). La migración `0008_calificaciones.sql` se aplica a mano desde el SQL Editor del dashboard; los archivos en `supabase/migrations/` son la fuente de verdad versionada.
- **`drop function` en las RPC recreadas.** `datos_conductor` e `historial_viajes` cambian sus columnas de retorno, y Postgres no permite cambiar el `returns table` con `create or replace`. La migración hace `drop function ... ; create function ...` para ambas.
- **Contraparte del prompt del conductor.** En el prompt inmediato de `/conducir` la contraparte se muestra como **"tu pasajero"** (texto fijo), porque la RLS de `profiles` no deja al conductor leer el nombre del pasajero en el panel en vivo. El nombre real del pasajero sí aparece en `/viajes` (vía `historial_viajes`). Se decidió **no** agregar un RPC `datos_pasajero` para mostrarlo en la oferta/viaje activo (queda fuera de alcance).
- **Retención del viaje cerrado para el prompt.** Al finalizar, `viajeAsignado()` deja de traer el viaje; `panel-conductor.tsx` retiene el trip recién cerrado en estado local (`viajeParaCalificar`) para poder ofrecer el prompt antes de volver a "Esperando viajes…".
- **Prompt del pasajero en la transición en vivo.** El prompt de `/viajar` se muestra cuando el polling detecta el paso a `finalizada`. Si se recarga la página con el viaje ya finalizado, `viajar/page.tsx` sólo monta `ViajePendiente` para viajes activos, así que el prompt no reaparece; ese caso cae al botón "Calificar" del historial.
- **Comentario oculto (confirmado).** Se confirmó dejar el comentario **guardado pero no mostrado** (decisión 9a): mostrar reseñas + moderación queda para un spec futuro.
- **Degradación sin migración.** El frontend no crashea si la migración aún no se aplicó: `historial_viajes`/`datos_conductor`/`reputacion` devuelven data vacía o nula y la UI cae a los estados por defecto ("Sin calificaciones aún", sin botón "Calificar"). Esto permitió buildear y probar el frontend antes de correr la migración.
- **Formato de reputación.** Se agregó `estrellas(rep)` en `lib/formato.ts` (`★ 4.8 (12)` / "Sin calificaciones aún"), reusado por perfil, tarjeta del conductor y oferta de despacho.

## Lo que **no** entra en este spec

- Mostrar los comentarios de las calificaciones (reseñas visibles en perfil o historial).
- Editar o borrar una calificación ya enviada.
- Calificar viajes `cancelada` u otros estados que no sean `finalizada`.
- Moderación, reporte o baja de calificaciones.
- Notificaciones ("te calificaron", "calificá tu último viaje").
- Efectos de la reputación sobre el despacho (priorizar/filtrar por estrellas).
- Desglose por criterios (puntualidad, limpieza, trato); acá es una estrella global.

Cada uno de esos, si aterriza, va en su propio spec.
