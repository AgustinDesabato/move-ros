# SPEC 29 — Perfil público

> **Estado:** implementado
> **Depende de:** SPEC 05, SPEC 08, SPEC 09, SPEC 28
> **Fecha:** 2026-10-07
> **Objetivo:** Que quien comparte un viaje con un conductor o un pasajero (y la remisería del conductor, y la propia persona) vea en `/usuarios/[id]` su promedio de estrellas y los comentarios que recibió, anónimos.

El Spec 08 guarda un comentario opcional con cada calificación, pero decidió no mostrarlo en ningún lado: "mostrarlo trae moderación, reporte y una UI de reseñas que son otro spec". Hoy de una persona sólo se ve el promedio (`★ 4,8`): en la tarjeta del conductor, en la oferta de viaje y en el propio perfil.

Este spec agrega la pantalla de reseñas. **Revierte** la decisión "el comentario se guarda pero no se muestra" del Spec 08, y por eso lo que alguien escribió antes creyendo que nadie lo leería pasa a ser visible para las contrapartes del calificado. No agrega moderación ni reporte.

## Alcance

**Incluye:**

- **Tres funciones `security definer`** en `supabase/migrations/0029_perfil_publico.sql` (idempotente):
  - `relacion_perfil(p_user_id)`: qué relación tiene quien llama con esa persona (`'propio'`, `'viaje'`, `'empresa'`, `'oferta'`) o `null` si ninguna. Es la única regla de acceso; las otras dos funciones la usan.
  - `perfil_publico(p_user_id)`: nombre, rol, promedio y cantidad de calificaciones recibidas. Devuelve una fila sólo si hay relación y la persona es `pasajero` o `conductor`.
  - `comentarios_recibidos(p_user_id)`: los últimos 20 comentarios recibidos, cada uno con sus estrellas y el **mes** en que se dejó. Nunca devuelve autor, viaje ni día.
- **`detalle_viaje()` recreada** (Spec 28): suma la columna `contraparte_id`, para poder enlazar al perfil desde el detalle del viaje.
- **Tipos TypeScript** (`lib/supabase/types.ts`): `PerfilPublico` y `ComentarioRecibido` nuevos; `ViajeDetalle` suma `contraparte_id`.
- **Helper de formato** `mesAnio(iso)` en `lib/formato.ts`: `"octubre de 2026"`.
- **Página `/usuarios/[id]`** (`app/usuarios/[id]/page.tsx`, Server Component, nuevo): avatar, nombre, rol, promedio con cantidad (`★ 4.8 (12)` o "Sin calificaciones aún") y la lista de comentarios. Sin relación, o si el `id` no existe o no es de un pasajero o conductor, responde "no encontrado".
- **Botón "Volver"** (`app/usuarios/[id]/boton-volver.tsx`, Client Component, nuevo): vuelve a la pantalla anterior, porque al perfil se llega desde varios lugares.
- **Quién puede ver el perfil de X:**
  - X mismo.
  - Quien tiene o tuvo un viaje con X (uno como pasajero y el otro como conductor asignado).
  - La remisería a la que X pertenece como conductor.
  - El conductor que tiene una oferta de viaje abierta de X. En este caso el perfil **no muestra el nombre** (dice "Pasajero"), igual que la oferta.
- **Entradas al perfil:**
  - Tarjeta del conductor que ve el pasajero durante el viaje (`app/viajar/viaje-pendiente.tsx`): enlace "Ver perfil".
  - Oferta que ve el conductor (`app/conducir/panel-conductor.tsx`): enlace "Ver perfil" junto a la reputación del pasajero.
  - Detalle de un viaje cerrado (`app/viajes/[id]/page.tsx`): el nombre de la contraparte pasa a ser un enlace a su perfil.
  - Panel de la remisería (`app/empresa/gestion-conductores.tsx`): enlace "Ver perfil" en la fila de cada conductor.
  - Menú propio (`app/perfil/page.tsx`): enlace "Ver mi perfil público", sólo para pasajero y conductor.

**Fuera de alcance (para specs futuros):**

- Moderar, reportar u ocultar un comentario.
- Responder a un comentario.
- Mostrar quién escribió cada comentario, o de qué viaje es.
- Paginación o "ver más": se muestran los últimos 20.
- Un mínimo de calificaciones antes de mostrar comentarios.
- Desglose por aspecto (puntualidad, limpieza): los aspectos elegidos ya forman parte del texto del comentario (Spec 08).
- Foto, antigüedad en la app, cantidad de viajes u otros datos del perfil.
- Datos del vehículo del conductor en el perfil público.
- Perfil público de una remisería o de soporte.
- Restringir la RPC `reputacion()` del Spec 08, que sigue devolviendo el promedio de cualquier usuario.
- Avisar a los usuarios que sus comentarios anteriores pasan a ser visibles.

## Modelo de datos

Sin tablas ni columnas nuevas. Se lee de `calificaciones` (Spec 08), `profiles`, `trips` y `trip_offers`.

### Migración `0029_perfil_publico.sql`

Idempotente, se aplica a mano desde el SQL Editor del dashboard y se puede pegar entera en una sola ejecución. Como recrea `detalle_viaje()` con una columna más, la `0028` ya no se puede volver a ejecutar después de ésta (mismo caso que `historial_viajes()` entre las migraciones 0007, 0008 y 0010).

```sql
-- SPEC 29 — Perfil público
-- Idempotente: segura de re-ejecutar. Recrea detalle_viaje() con una columna
-- más: después de esta migración no volver a ejecutar la 0028.

-- ============================================================================
-- 1) relacion_perfil: la única regla de acceso al perfil público
-- ============================================================================
-- Qué relación tiene quien llama con p_user_id, o null si ninguna (o sin
-- sesión). El orden importa: 'oferta' va último porque es la única relación
-- que no deja ver el nombre.
create or replace function public.relacion_perfil(p_user_id uuid)
returns text
language sql
stable
security definer set search_path = public
as $$
  select case
    when auth.uid() is null then null
    when p_user_id = auth.uid() then 'propio'
    when exists (
      select 1 from public.trips t
       where (t.pasajero_id = auth.uid() and t.conductor_id = p_user_id)
          or (t.conductor_id = auth.uid() and t.pasajero_id = p_user_id)
    ) then 'viaje'
    when exists (
      select 1 from public.profiles p
       where p.id = p_user_id and p.empresa_id = auth.uid()
    ) then 'empresa'
    when exists (
      select 1 from public.trip_offers o
        join public.trips t on t.id = o.trip_id
       where o.conductor_id = auth.uid() and o.estado = 'ofrecida'
         and t.pasajero_id = p_user_id
    ) then 'oferta'
  end;
$$;

-- ============================================================================
-- 2) perfil_publico: nombre, rol y reputación
-- ============================================================================
-- Cero o una fila. Sólo pasajeros y conductores tienen perfil público.
create or replace function public.perfil_publico(p_user_id uuid)
returns table (
  id       uuid,
  nombre   text,
  role     public.user_role,
  promedio numeric,
  cantidad integer
)
language sql
stable
security definer set search_path = public
as $$
  select p.id,
         -- con sólo una oferta abierta, el conductor todavía no ve el nombre
         case when public.relacion_perfil(p_user_id) <> 'oferta' then p.nombre end,
         p.role,
         (select round(avg(c.estrellas)::numeric, 1)
            from public.calificaciones c where c.destinatario_id = p.id),
         (select count(*)::integer
            from public.calificaciones c where c.destinatario_id = p.id)
    from public.profiles p
   where p.id = p_user_id
     and p.role in ('pasajero', 'conductor')
     and public.relacion_perfil(p_user_id) is not null;
$$;

-- ============================================================================
-- 3) comentarios_recibidos: las reseñas, anónimas
-- ============================================================================
-- Sólo estrellas, texto y el mes: nunca el autor, el viaje ni el día. Las
-- calificaciones sin comentario cuentan en el promedio pero no se listan.
create or replace function public.comentarios_recibidos(p_user_id uuid)
returns table (
  estrellas  smallint,
  comentario text,
  mes        date
)
language sql
stable
security definer set search_path = public
as $$
  select c.estrellas, c.comentario, date_trunc('month', c.created_at)::date
    from public.calificaciones c
   where c.destinatario_id = p_user_id
     and c.comentario is not null
     and public.relacion_perfil(p_user_id) is not null
   order by c.created_at desc
   limit 20;
$$;

-- ============================================================================
-- 4) detalle_viaje recreada: suma contraparte_id
-- ============================================================================
-- Parte del cuerpo del Spec 28 y agrega el id de la contraparte, para enlazar
-- a su perfil público. Cambia el returns table -> drop + create.
drop function if exists public.detalle_viaje(uuid);

create function public.detalle_viaje(p_trip_id uuid)
returns table (
  id              uuid,
  estado          public.trip_status,
  created_at      timestamptz,
  cerrado_at      timestamptz,
  origen_label    text,
  origen_lat      double precision,
  origen_lng      double precision,
  destino_label   text,
  destino_lat     double precision,
  destino_lng     double precision,
  distancia_m     integer,
  duracion_s      integer,
  tarifa_estimada integer,
  metodo_pago     public.metodo_pago,
  soy_conductor   boolean,
  contraparte     text,
  contraparte_id  uuid,
  pago_estado     public.pago_estado,
  pago_monto      integer,
  pago_comision   integer,
  pago_neto       integer,
  pago_a_empresa  boolean,
  mi_estrellas    smallint,
  mi_comentario   text
)
language sql
stable
security definer set search_path = public
as $$
  select t.id, t.estado, t.created_at, t.cerrado_at,
         t.origen_label, t.origen_lat, t.origen_lng,
         t.destino_label, t.destino_lat, t.destino_lng,
         t.distancia_m, t.duracion_s, t.tarifa_estimada, t.metodo_pago,
         coalesce(t.conductor_id = auth.uid(), false) as soy_conductor,
         case
           when t.pasajero_id = auth.uid() then cp.nombre   -- miro como pasajero -> conductor
           else pp.nombre                                    -- miro como conductor -> pasajero
         end as contraparte,
         case
           when t.pasajero_id = auth.uid() then t.conductor_id
           else t.pasajero_id
         end as contraparte_id,
         pg.estado as pago_estado,
         pg.monto  as pago_monto,
         -- comisión y neto sólo para el conductor
         case when t.conductor_id = auth.uid() then pg.comision end as pago_comision,
         case when t.conductor_id = auth.uid() then pg.neto     end as pago_neto,
         (pg.id is not null and pg.destinatario_id <> t.conductor_id) as pago_a_empresa,
         c.estrellas  as mi_estrellas,
         c.comentario as mi_comentario
    from public.trips t
    left join public.profiles cp on cp.id = t.conductor_id
    left join public.profiles pp on pp.id = t.pasajero_id
    left join public.pagos pg on pg.trip_id = t.id
    left join public.calificaciones c
           on c.trip_id = t.id and c.autor_id = auth.uid()
   where t.id = p_trip_id
     and (t.pasajero_id = auth.uid() or t.conductor_id = auth.uid());
$$;
```

`contraparte_id` es `null` en un viaje cancelado sin conductor asignado; en ese caso el detalle muestra "Sin conductor" sin enlace.

### Tipos TypeScript (`lib/supabase/types.ts`, extendido)

```ts
// El perfil público de un pasajero o conductor, tal como lo devuelve la RPC
// perfil_publico() (Spec 29). nombre es null cuando quien mira sólo tiene una
// oferta de viaje abierta de esa persona.
export type PerfilPublico = {
  id: string;
  nombre: string | null;
  role: UserRole;
  promedio: number | null;
  cantidad: number;
};

// Un comentario recibido, tal como lo devuelve comentarios_recibidos(): sin
// autor ni viaje. mes es el primer día del mes en que se dejó ("2026-10-01").
export type ComentarioRecibido = {
  estrellas: number;
  comentario: string;
  mes: string;
};
```

`ViajeDetalle` suma `contraparte_id: string | null`.

### Página `/usuarios/[id]`

| Situación | Resultado |
| --- | --- |
| Sin sesión | El middleware ya redirige a `/bienvenida`. |
| `perfil_publico` no devuelve fila (sin relación, `id` inexistente o mal formado, o la persona no es pasajero ni conductor) | `notFound()` |
| Devuelve fila | Se muestra el perfil y se piden los comentarios |

Contenido:

- Nombre, o "Pasajero" cuando `nombre` es `null`.
- Rol: "Conductor" o "Pasajero".
- Reputación con `estrellas()` de `lib/formato.ts`: `★ 4.8 (12)` o "Sin calificaciones aún".
- Sección "Comentarios": cada uno con sus estrellas, el texto y `mesAnio(mes)`. Sin comentarios: "Todavía no recibió comentarios." (o "Todavía no recibiste comentarios." en el perfil propio).
- Si hay 20 comentarios, una línea al pie: "Se muestran los 20 más recientes.".

El perfil propio se reconoce comparando el `id` de la URL con el del usuario logueado. Muestra exactamente lo mismo que ven los demás.

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Commit 1 — este spec.** `specs/29-perfil-publico.md`.

2. **Migración.** `supabase/migrations/0029_perfil_publico.sql` y aplicarla en Supabase. *Verificación (SQL Editor):* corre dos veces sin error; sin sesión de usuario, `select public.relacion_perfil('<id>')` da `null` y `perfil_publico` y `comentarios_recibidos` devuelven 0 filas.

3. **Tipos y formato.** `PerfilPublico`, `ComentarioRecibido` y `contraparte_id` en `lib/supabase/types.ts`; `mesAnio` en `lib/formato.ts`. *Verificación:* `npm run lint` y `npm run build` pasan.

4. **Página `/usuarios/[id]`.** `app/usuarios/[id]/page.tsx` y `boton-volver.tsx`; enlace "Ver mi perfil público" en `app/perfil/page.tsx`. *Verificación:* filas 1, 2, 8 y 9 del caso de prueba.

5. **Entrada desde el detalle del viaje.** El nombre de la contraparte en `app/viajes/[id]/page.tsx` pasa a ser un enlace. *Verificación:* filas 3 y 4 del caso de prueba.

6. **Entradas desde el viaje en curso y la oferta.** "Ver perfil" en la tarjeta del conductor (`app/viajar/viaje-pendiente.tsx`) y en la oferta (`app/conducir/panel-conductor.tsx`). *Verificación:* filas 5 y 6 del caso de prueba.

7. **Entrada desde la remisería.** "Ver perfil" en `app/empresa/gestion-conductores.tsx`. *Verificación:* fila 7 del caso de prueba.

8. **Prueba end-to-end.** Ver "Caso de prueba". *Verificación:* todos los criterios de aceptación, más `npm run build` y `npm run lint`.

## Caso de prueba

Precondición: `npm run dev` corriendo en `http://localhost:3000`, migración 0029 aplicada, un pasajero (P) y un conductor (C) de la remisería (E) con un viaje finalizado entre ellos, en el que P calificó a C con 4 estrellas y el comentario "Muy amable", y C calificó a P con 5 estrellas sin comentario. Otro pasajero (Q) sin viajes con C.

| # | Paso | Resultado esperado |
| --- | --- | --- |
| 1 | Como C, abrir `/perfil` y tocar "Ver mi perfil público". | Va a `/usuarios/{C}`: nombre de C, "Conductor", `★ 4.0 (1)` y el comentario "Muy amable" con 4 estrellas y el mes y año. No aparece el nombre de P ni el día. |
| 2 | Como P, abrir `/perfil` y tocar "Ver mi perfil público". | `★ 5.0 (1)` y "Todavía no recibiste comentarios.": la calificación sin texto cuenta en el promedio pero no se lista. |
| 3 | Como P, abrir el detalle del viaje finalizado (`/viajes/{id}`) y tocar el nombre de C. | Va a `/usuarios/{C}` con lo mismo que vio C en el paso 1. "Volver" regresa al detalle. |
| 4 | Como C, desde el mismo detalle, tocar el nombre de P. | Va a `/usuarios/{P}` con el nombre de P y "Todavía no recibió comentarios.". |
| 5 | Como P, pedir un viaje nuevo que acepte C y tocar "Ver perfil" en la tarjeta del conductor. | Va a `/usuarios/{C}`. Al volver, el viaje en curso sigue en pantalla. |
| 6 | Como Q, pedir un viaje; como C, en la oferta, tocar "Ver perfil". | Va a `/usuarios/{Q}`: dice "Pasajero" **sin nombre**, con su reputación y sus comentarios. |
| 7 | Como E, en `/empresa`, abrir la fila de C y tocar "Ver perfil". | Va a `/usuarios/{C}` con el nombre, el promedio y los comentarios de C. |
| 8 | Como Q, sin oferta ni viaje con C, abrir `/usuarios/{C}` por la URL. | Página "no encontrado". |
| 9 | Como P, abrir `/usuarios/no-es-un-id` y `/usuarios/{E}`. | Página "no encontrado" en los dos casos. |
| 10 | En el SQL Editor, logueado como Q, `select * from comentarios_recibidos('{C}')`. | 0 filas. |

## Criterios de aceptación

- [ ] `relacion_perfil(id)` devuelve `'propio'`, `'viaje'`, `'empresa'` u `'oferta'` según corresponda, y `null` sin relación o sin sesión.
- [ ] `perfil_publico(id)` y `comentarios_recibidos(id)` no devuelven nada a quien no tiene relación con esa persona, ni por la pantalla ni llamando a las RPC directamente.
- [ ] La migración 0029 corre dos veces seguidas sin error.
- [ ] `/usuarios/{id}` muestra nombre, rol, promedio con cantidad y los comentarios recibidos.
- [ ] Cada comentario muestra sus estrellas, su texto y el mes y año; nunca el autor, el viaje ni el día.
- [ ] Una calificación sin comentario cuenta en el promedio y no aparece en la lista.
- [ ] Se muestran como máximo 20 comentarios, el más nuevo primero.
- [ ] Un conductor con sólo una oferta abierta ve el perfil del pasajero sin su nombre.
- [ ] La remisería ve el perfil público de sus conductores, y no el de conductores ajenos.
- [ ] Cada pasajero y conductor llega a su propio perfil público desde `/perfil` y ve lo mismo que los demás.
- [ ] Hay un enlace al perfil en la tarjeta del conductor, en la oferta, en el detalle del viaje y en la fila del conductor en `/empresa`.
- [ ] Sin relación, con un `id` inexistente o mal formado, o para una remisería o soporte, la página responde "no encontrado".
- [ ] El detalle del viaje (Spec 28) sigue mostrando todo lo anterior.
- [ ] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** ven el perfil quienes comparten un viaje con la persona, el conductor con una oferta abierta, la remisería del conductor y la propia persona. **No:** cualquier usuario logueado. Decisión del usuario: nadie recorre perfiles de desconocidos, y la remisería puede ver cómo califican a sus conductores.
- **Sí:** comentarios anónimos, con mes y año. **No:** fecha exacta ni nombre del autor. Decisión del usuario: reduce que se identifique quién lo escribió.
- **Sí:** cada persona ve su propio perfil público, con sus comentarios. **No:** que sólo los lean los demás. Decisión del usuario.
- **Sí:** entradas desde el viaje en curso, la oferta y el detalle del viaje. **No:** sólo una de ellas. Decisión del usuario.
- **Sí:** mostrar los comentarios, revirtiendo "se guardan pero no se muestran" del Spec 08. **No:** mantenerlos ocultos. Es el objetivo de este spec; el Spec 08 ya lo anotaba como spec futuro.
- **Sí:** se muestran también los comentarios escritos antes de este spec. **No:** sólo los nuevos. No hay forma simple de distinguirlos en pantalla, y son pocos en el MVP. Queda anotado como riesgo.
- **Sí:** el mes se calcula en la base (`date_trunc`) y la RPC no devuelve la fecha completa. **No:** devolver `created_at` y recortarlo en la pantalla. Así el día nunca sale de la base, ni llamando a la RPC directamente.
- **Sí:** acceso por RPC `security definer` con el chequeo adentro. **No:** ampliar la policy `calificaciones_select`. Mismo patrón que `reputacion()`, `historial_viajes()` y `reclamos_soporte()`: una policy más amplia expondría también `autor_id` y `trip_id`.
- **Sí:** una función `relacion_perfil()` compartida por las dos RPC. **No:** repetir las condiciones en cada una. Una sola regla de acceso, y permite ocultar el nombre según la relación.
- **Sí:** con sólo una oferta abierta, el perfil no muestra el nombre del pasajero. **No:** mostrarlo siempre. La oferta hoy dice "Pasajero" sin nombre; el conductor lo conoce recién al aceptar.
- **Sí:** la relación `'oferta'` exige que la oferta siga `ofrecida`. **No:** cualquier oferta pasada. Un conductor que rechazó o dejó vencer la oferta no conserva acceso a las reseñas de ese pasajero.
- **Sí:** ruta `/usuarios/[id]`. **No:** `/perfil/[id]`. `/perfil` y sus subrutas (`editar`, `contactos`, `favoritos`, `pagos`, `reclamos`) son la cuenta propia; mezclar ahí un segmento dinámico se presta a confusión.
- **Sí:** botón "Volver" que regresa a la pantalla anterior. **No:** un destino fijo. Al perfil se entra desde cinco lugares distintos.
- **Sí:** tope de 20 comentarios, sin paginación. **No:** lista completa. Mismo criterio que el resto de los listados del MVP.
- **Sí:** sólo pasajeros y conductores tienen perfil público. **No:** remiserías ni soporte. No reciben calificaciones.
- **Sí:** recrear `detalle_viaje()` para sumar `contraparte_id`. **No:** una RPC aparte para averiguar el id. El detalle ya trae el nombre de la contraparte; el id es el dato que falta para enlazar.
- **No:** moderación ni reporte de comentarios. Es el costo que el Spec 08 señalaba; se acepta para el MVP y queda como spec futuro.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Con pocos viajes, el calificado deduce quién escribió cada comentario aunque no figure el nombre (un solo viaje ese mes). | Aceptado: es el límite del anonimato elegido. Un mínimo de calificaciones antes de mostrar comentarios queda fuera de alcance. |
| Comentarios escritos antes de este spec, cuando no se mostraban, pasan a ser visibles. | Aceptado y anotado en Decisiones. Avisar a los usuarios queda fuera de alcance. |
| Un comentario ofensivo o falso queda visible para todas las contrapartes del calificado. | Sin moderación en este spec. Se puede borrar la fila a mano desde el SQL Editor; el reporte y la moderación van en otro spec. |
| La oferta dura 20 segundos: si el conductor entra al perfil del pasajero, la oferta puede vencer mientras lee. | El enlace no reemplaza la reputación corta (`★ 4,8`) que ya se ve en la oferta sin salir de la pantalla. Al volver, si la oferta venció, el panel muestra el estado de siempre. |
| El pasajero sale de `/viajar` para ver el perfil del conductor durante un viaje. | `/viajar` recarga el viaje activo al volver; el viaje no depende de que la pantalla esté abierta. |
| `relacion_perfil()` se evalúa más de una vez por llamada. | Es `stable` y son consultas por índice sobre el usuario logueado; el volumen del MVP no lo nota. |
| Después de la 0029, volver a ejecutar la 0028 falla porque cambió el tipo de retorno de `detalle_viaje()`. | Aclarado en la cabecera de la 0029. Mismo caso que `historial_viajes()` en las migraciones 0007, 0008 y 0010. |

## Lo que **no** entra en este spec

- Moderación, reporte o respuesta a comentarios.
- Autor o viaje de cada comentario.
- Paginación de comentarios.
- Mínimo de calificaciones para mostrar comentarios.
- Otros datos en el perfil (foto, antigüedad, vehículo, cantidad de viajes).
- Perfil público de remiserías o de soporte.
- Restringir `reputacion()`.
- Aviso a los usuarios sobre los comentarios anteriores.

Cada uno de esos, si aterriza, va en su propio spec.
