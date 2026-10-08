# SPEC 24 — Timeout del despacho: viaje que nadie acepta se cancela solo

> **Estado:** aprobado
> **Depende de:** SPEC 04, SPEC 05
> **Fecha:** 2026-10-05
> **Objetivo:** Que un viaje `pendiente` que ningún conductor acepta dentro de 10 minutos pase solo a `cancelada`, y que el pasajero lo vea reflejado en `/viajar` sin tener que cancelarlo a mano.

El Spec 05 decidió explícitamente **no** agregar esto: *"Sí: un viaje que nadie acepta queda `pendiente` hasta que el pasajero cancele. No: timeout automático que lo cancele; simplifica el MVP."* Este spec revierte esa decisión puntual, sin tocar el resto del despacho (1×1, TTL de oferta de 20s, presencia por heartbeat, etc.).

El despacho ya avanza de forma "perezosa": no hay cron ni background job — cada vez que el pasajero con un viaje `pendiente` tiene `/viajar` abierto, su polling (~5s) llama a la RPC `despachar_viaje`, que vence ofertas y ofrece al siguiente candidato. Este spec agrega el chequeo de timeout **dentro de esa misma función**, siguiendo el mismo mecanismo ya decidido en el Spec 05 ("el pasajero que espera es un reloj natural y suficiente para el MVP"), sin introducir infraestructura nueva.

## Alcance

**Incluye:**

- `supabase/migrations/0024_timeout_despacho.sql`: `create or replace function public.despachar_viaje(...)` — mismo cuerpo del Spec 05, con un chequeo nuevo al principio: si el viaje sigue `pendiente` y pasaron **10 minutos o más** desde `created_at`, vence cualquier oferta activa y pasa el viaje a `cancelada` (mismo efecto que `cancelar_viaje`), sin intentar ofrecerlo a nadie más.
- `lib/despacho.ts`: constante `DESPACHO_TIMEOUT_MIN = 10`, documentando el valor que vive como literal en SQL (mismo criterio que `OFERTA_TTL_S`/`PRESENCIA_TTL_S`: la fuente de verdad es la función de Postgres; la constante en TS es la referencia para quien lea el código del cliente).
- `app/actions/viaje.ts` (`estadoViajeActivo`): cuando el viaje está `pendiente`, después de llamar a `despachar_viaje` **vuelve a leer el viaje** (en el mismo poll) para que, si el timeout lo acaba de cancelar, el pasajero lo vea sin esperar un ciclo de poll más. Ya no devuelve `null` cuando el viaje está `cancelada`: devuelve `{ trip, conductor: null }` para que la vista pueda mostrar un cartel en vez de desaparecer en silencio.
- `app/viajar/viaje-pendiente.tsx`: rama nueva para `trip.estado === "cancelada"` — un cartel **"Tu viaje fue cancelado"** con un botón para volver al selector. Cubre tanto el timeout como cualquier cancelación que la vista llegue a observar por polling (ver Decisiones).

**Fuera de alcance (para specs futuros):**

- Avisar al pasajero **por qué** se canceló (timeout vs. cualquier otra causa): no se guarda una columna de motivo; el cartel es el mismo para cualquier cancelación que la vista observe por polling.
- Reintentar el despacho automáticamente tras el timeout, o sugerir ampliar el radio de búsqueda: el pasajero tiene que volver a solicitar el viaje desde el selector, como ya hace tras un "Cancelar" manual.
- Hacer el timeout configurable desde la UI o por variable de entorno: el valor es un literal en la función SQL, como el TTL de oferta y la ventana de presencia del Spec 05.
- Notificación push cuando se cancela por timeout: el pasajero lo ve si tiene `/viajar` abierto (polling), igual que el resto del despacho.
- Cambiar el timeout según demanda, hora del día o disponibilidad de conductores: siempre son 10 minutos fijos.
- Cron / background job para que el timeout corra sin que el pasajero tenga la pantalla abierta: sigue fuera de alcance, como decidió el Spec 05.

## Modelo de datos

Migración `supabase/migrations/0024_timeout_despacho.sql`. Idempotente (es un `create or replace function`, sin tocar tablas ni enums). Se aplica a mano desde el SQL Editor del dashboard, de una sola vez.

### `despachar_viaje` con el chequeo de timeout

```sql
create or replace function public.despachar_viaje(p_trip_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_estado     public.trip_status;
  v_created_at timestamptz;
  v_next       uuid;
begin
  -- Serializa despachos concurrentes del mismo viaje (poll del pasajero vs. rechazo).
  select estado, created_at into v_estado, v_created_at
    from public.trips where id = p_trip_id for update;
  if not found or v_estado <> 'pendiente' then
    return;
  end if;

  -- SPEC 24: nadie lo aceptó en 10 minutos → se cancela, igual que cancelar_viaje.
  if v_created_at <= now() - interval '10 minutes' then
    update public.trips set estado = 'cancelada' where id = p_trip_id;
    update public.trip_offers
      set estado = 'vencida'
      where trip_id = p_trip_id and estado = 'ofrecida';
    return;
  end if;

  -- Vencer la oferta activa expirada.
  update public.trip_offers
    set estado = 'vencida'
    where trip_id = p_trip_id and estado = 'ofrecida' and expira_at <= now();

  -- ¿Sigue habiendo oferta vigente? Entonces no hay nada que hacer.
  if exists (
    select 1 from public.trip_offers
    where trip_id = p_trip_id and estado = 'ofrecida' and expira_at > now()
  ) then
    return;
  end if;

  -- Elegir el siguiente candidato: conductor con perfil completo (nombre, teléfono
  -- y vehículo), activo (last_seen reciente), no excluido de este viaje y no ocupado.
  select p.id into v_next
  from public.profiles p
  join public.vehicles v on v.conductor_id = p.id
  where p.role = 'conductor'
    and p.nombre is not null
    and p.telefono is not null
    and p.last_seen_at > now() - interval '30 seconds'
    and not exists (
      select 1 from public.trip_offers o
      where o.trip_id = p_trip_id and o.conductor_id = p.id
        and o.estado in ('rechazada', 'vencida')
    )
    and not exists (
      select 1 from public.trip_offers o2
      where o2.conductor_id = p.id and o2.estado = 'ofrecida' and o2.expira_at > now()
    )
    and not exists (
      select 1 from public.trips t
      where t.conductor_id = p.id and t.estado in ('aceptada', 'en_curso')
    )
  order by p.last_seen_at asc, p.id
  limit 1;

  if v_next is null then
    return;
  end if;

  insert into public.trip_offers (trip_id, conductor_id, expira_at)
  values (p_trip_id, v_next, now() + interval '20 seconds');
end;
$$;
```

Todo lo demás del Spec 05 (`aceptar_oferta`, `rechazar_oferta`, `iniciar_viaje`, `finalizar_viaje`, `bajarse_viaje`, `cancelar_viaje`, la tabla `trip_offers`, sus policies) queda **sin cambios**. El `select … for update` sigue sirviendo para serializar contra `aceptar_oferta` (que toma el mismo lock): si un conductor acepta justo antes de que el poll detecte el timeout, gana la aceptación (el viaje ya no está `pendiente` cuando `despachar_viaje` vuelve a correr) y no se cancela.

### `lib/despacho.ts`

```ts
export const OFERTA_TTL_S = 20;
export const PRESENCIA_TTL_S = 30;
export const POLL_MS = 5000;

// Spec 24: un viaje pendiente sin aceptar se cancela solo después de este
// tiempo. El literal real vive en despachar_viaje() (Postgres); esta
// constante es sólo la referencia del lado del cliente.
export const DESPACHO_TIMEOUT_MIN = 10;
```

### `estadoViajeActivo` (`app/actions/viaje.ts`)

```ts
export async function estadoViajeActivo(tripId: string): Promise<EstadoViaje> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("trips")
    .select("*")
    .eq("id", tripId)
    .eq("pasajero_id", user.id)
    .maybeSingle();

  let trip = data as Trip | null;
  if (!trip) return null;

  if (trip.estado === "pendiente") {
    await supabase.rpc("despachar_viaje", { p_trip_id: trip.id });
    // El timeout del Spec 24 puede haber cancelado el viaje recién ahora:
    // se relee para que este mismo poll ya refleje el cambio.
    const { data: actualizado } = await supabase
      .from("trips")
      .select("*")
      .eq("id", tripId)
      .eq("pasajero_id", user.id)
      .maybeSingle();
    trip = (actualizado as Trip | null) ?? trip;
  }

  let conductor: ConductorPublico | null = null;
  if (trip.conductor_id) {
    const { data: cd } = await supabase.rpc("datos_conductor", { p_trip_id: trip.id });
    conductor = (cd as ConductorPublico[] | null)?.[0] ?? null;
  }

  return { trip, conductor };
}
```

Cambia respecto del Spec 05 en dos puntos: ya **no** hay un `if (trip.estado === "cancelada") return null;` temprano (`cancelada` es ahora un estado válido para devolver), y se relee el viaje después de `despachar_viaje` cuando estaba `pendiente`.

### `viaje-pendiente.tsx`: cartel de cancelación

```tsx
if (trip.estado === "cancelada") {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-peligro-suave text-peligro">
        <IconoAlerta className="size-7" />
      </span>
      <h1 className={tituloCls}>Tu viaje fue cancelado</h1>
      <p className="text-[15px] text-tenue">Podés solicitar uno nuevo cuando quieras.</p>
      <button type="button" onClick={volver} className={btnPrimario}>
        Volver a intentar
      </button>
    </main>
  );
}
```

Esta rama va junto a la de `estado === "finalizada"`, antes de calcular `buscando`. El mensaje es neutral a propósito ("Tu viaje fue cancelado", no "Nadie lo aceptó a tiempo"): la vista puede llegar a este estado tanto por el timeout como por una cancelación disparada desde otra pestaña/dispositivo del mismo pasajero (ver Decisiones); en el camino normal —cancelar con el botón, en la misma pestaña— `router.refresh()` ya desmonta el componente antes de que vuelva a pollear, así que ese camino sigue exactamente igual que antes.

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Commit 1 — este spec.** `specs/24-timeout-despacho.md`.

2. **Migración.** `supabase/migrations/0024_timeout_despacho.sql` (`create or replace function despachar_viaje`). Aplicarla en Supabase (una sola ejecución). *Verificación (SQL Editor):* con un viaje de prueba, `update trips set created_at = now() - interval '11 minutes' where id = '<id>'` y después `select despachar_viaje('<id>');` deja ese viaje en `cancelada` y cualquier oferta `ofrecida` asociada en `vencida`; con un viaje de menos de 10 minutos, `despachar_viaje` sigue comportándose exactamente igual que antes (ofrece/vence normalmente).

3. **Constante.** `DESPACHO_TIMEOUT_MIN` en `lib/despacho.ts`. *Verificación:* `npm run lint` pasa.

4. **`estadoViajeActivo`.** Releer el viaje tras `despachar_viaje` y devolver `cancelada` en vez de `null`. *Verificación:* `npm run build` compila.

5. **Cartel en `viaje-pendiente.tsx`.** Rama nueva para `estado === "cancelada"`. *Verificación:* ver Caso de prueba.

6. **Prueba end-to-end.** Ver "Caso de prueba". *Verificación:* todos los criterios de aceptación, más `npm run build` y `npm run lint`.

## Caso de prueba

Precondición: `npm run dev` en `http://localhost:3000`, migración 0024 aplicada, una cuenta pasajero (P).

| # | Paso | Resultado esperado |
| --- | --- | --- |
| 1 | Como P, solicitar un viaje sin que ningún conductor esté activo. `/viajar` queda en "Buscando conductor…". | Comportamiento sin cambios: pantalla de búsqueda. |
| 2 | En el SQL Editor, `update trips set created_at = now() - interval '11 minutes' where id = '<id del viaje>';`. | Sólo cambia la fecha; el viaje sigue `pendiente` hasta el próximo poll. |
| 3 | Esperar hasta el próximo poll de `/viajar` (≤5s) sin recargar la página. | La pantalla pasa de "Buscando conductor…" al cartel "Tu viaje fue cancelado", con el botón "Volver a intentar". |
| 4 | Tocar "Volver a intentar". | Vuelve el selector de origen/destino. |
| 5 | En el SQL Editor, `select estado from trips where id = '<id>';`. | `cancelada`. |
| 6 | Solicitar un viaje nuevo y, antes de los 10 minutos, cancelarlo a mano con el botón "Cancelar solicitud". | Comportamiento sin cambios: vuelve el selector directo (sin pasar por el cartel), igual que antes del spec. |
| 7 | Solicitar un viaje con un conductor activo que lo acepta dentro de los 10 minutos. | El viaje pasa a `aceptada` normalmente; el timeout no interfiere. |
| 8 | Repetir el paso 2-3 pero con un conductor que tiene una oferta `ofrecida` vigente en ese viaje al momento del timeout. | El viaje se cancela y esa oferta pasa a `vencida`; si el conductor intenta aceptarla, `aceptar_oferta` es no-op (el viaje ya no está `pendiente`). |

## Criterios de aceptación

- [ ] Un viaje `pendiente` cuyo `created_at` tiene 10 minutos o más pasa a `cancelada` en el próximo `despachar_viaje` (disparado por el poll del pasajero), sin importar si había o no una oferta activa.
- [ ] Cualquier oferta `ofrecida` de ese viaje pasa a `vencida` en el mismo momento.
- [ ] Un conductor no puede aceptar una oferta de un viaje que ya se canceló por timeout (no-op de `aceptar_oferta`).
- [ ] Un viaje de menos de 10 minutos no se ve afectado: el despacho (ofertas, candidatos, TTL de 20s) funciona exactamente igual que en el Spec 05.
- [ ] El pasajero con `/viajar` abierto ve, sin recargar, el cartel "Tu viaje fue cancelado" en cuanto el timeout se cumple (dentro de un ciclo de poll, ~5s).
- [ ] Cancelar un viaje a mano con el botón "Cancelar solicitud" sigue devolviendo directamente al selector, sin mostrar el cartel nuevo.
- [ ] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** el timeout vive como chequeo adicional dentro de `despachar_viaje`, disparado por el mismo poll del pasajero (avance perezoso). **No:** cron / background job. Mismo criterio que ya fijó el Spec 05 para todo el despacho: este stack no tiene jobs programados y el pasajero esperando es un reloj suficiente para el MVP.
- **Sí:** 10 minutos, fijo como literal en la función SQL (como el TTL de oferta de 20s y la ventana de presencia de 30s del Spec 05). **No:** configurable por variable de entorno o por UI. Es un valor MVP revisable, igual que la tarifa del Spec 04.
- **Sí:** al timeout, mismo efecto que `cancelar_viaje` (viaje a `cancelada`, ofertas activas a `vencida`). **No:** un estado nuevo como `'vencido'` o `'sin_conductores'`. El pasajero necesita la misma consecuencia práctica (puede volver a solicitar); un estado nuevo obligaría a tocar cada lugar que ya distingue `cancelada` sin agregar nada que el checklist pida.
- **Sí:** `estadoViajeActivo` relee el viaje después de llamar a `despachar_viaje` cuando estaba `pendiente`. **No:** dejar que el pasajero vea el cambio recién en el poll siguiente. Evita un ciclo de poll de más (~5s) de demora entre que se cumple el timeout y que la vista lo refleja; el costo es una lectura extra a la base sólo mientras el viaje está `pendiente` (ya es el camino menos frecuente de los tres estados posibles).
- **Sí:** `estadoViajeActivo` devuelve `{ trip, conductor: null }` para `cancelada` en vez de `null`. **No:** mantener el `return null` del Spec 05 y confiar en que `router.refresh()` alcance. El pedido explícito es "el pasajero lo ve"; un cartel dedicado es más fiel a eso que desaparecer en silencio hacia el selector.
- **Sí:** el cartel de cancelación es el mismo para cualquier causa (timeout, o una cancelación observada por polling que no vino del botón de esta misma pestaña). **No:** guardar una columna de motivo para distinguir "cancelado por timeout" de "cancelado por el usuario". El pedido es que el pasajero vea que se canceló, no por qué; agregar esa distinción es una columna y una decisión de producto que nadie pidió.
- **Sí:** el botón "Cancelar solicitud" sigue su camino de siempre (`cancelarViaje` + `router.refresh()` inmediato, sin pasar por el cartel nuevo). **No:** unificarlo para que también pase por la rama `cancelada` de `viaje-pendiente.tsx`. El refresh ya desmonta el componente antes del próximo poll; tocar ese camino para forzarlo por el cartel nuevo es trabajo extra sin beneficio (el pasajero ya sabe que él la canceló, lo acaba de tocar).

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| 10 minutos cancela un viaje que todavía tenía chance con el próximo candidato (ciclo de oferta de 20s). | 10 minutos da margen a ~30 ofertas sucesivas de 20s; es un valor MVP revisable si en la práctica resulta corto o largo. |
| El pasajero cierra `/viajar` antes de que se cumpla el timeout: el despacho (y el timeout) no avanza hasta que vuelva a abrirlo. | Mismo riesgo ya aceptado en el Spec 05 para todo el despacho: sin pasajero esperando, no hay urgencia; al reabrir `/viajar`, el primer poll aplica el timeout si ya corresponde. |
| Carrera: un conductor acepta la oferta justo cuando el pasajero cumple el timeout. | El `select … for update` de `despachar_viaje` y de `aceptar_oferta` toman el mismo lock sobre la fila de `trips`; sólo una de las dos transiciones gana, la otra es no-op. |
| La lectura extra en `estadoViajeActivo` (releer el viaje tras `despachar_viaje`) agrega una consulta más por poll mientras el viaje está `pendiente`. | Es una consulta liviana por `id` con índice de primary key; el mismo poll ya hacía una llamada a RPC más costosa (`despachar_viaje`) en ese mismo estado. |
| El cartel "Tu viaje fue cancelado" podría confundir a un pasajero que lo canceló él mismo desde otra pestaña, haciéndole pensar que fue el sistema. | Aceptado: el mensaje es neutral a propósito (no afirma una causa) y el caso (dos pestañas abiertas con el mismo viaje) no es uno que el resto de la app maneje hoy. |

## Lo que **no** entra en este spec

- Motivo de cancelación distinguible (timeout vs. otra causa).
- Reintento automático o ampliación de radio de búsqueda tras el timeout.
- Timeout configurable desde la UI o por entorno.
- Notificación push al cancelarse por timeout.
- Timeout variable según demanda, horario o disponibilidad.
- Cron / background job independiente del polling del pasajero.

Cada uno de esos, si aterriza, va en su propio spec.
