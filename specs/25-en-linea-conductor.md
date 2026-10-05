# SPEC 25 — Botón "En línea / Fuera de línea" del conductor

> **Estado:** Aprobado
> **Depende de:** SPEC 05
> **Fecha:** 2026-10-05
> **Objetivo:** Que el conductor tenga un estado "en línea"/"fuera de línea" persistido en la base, controlado por el switch que ya existe en `/conducir`, y que el despacho sólo le ofrezca viajes mientras está en línea.

El Spec 05 decidió explícitamente **no** agregar esto: *"Sí: presencia implícita por heartbeat. No: toggle explícito de disponibilidad (en línea/fuera de línea) del conductor; menos superficie de UI y de estado."* Ese toggle ya existe hoy en `app/conducir/panel-conductor.tsx` (el switch "Disponible/No disponible" del encabezado) pero es sólo estado de React: se resetea al recargar la página y la base nunca lo ve, así que `despachar_viaje` igual podría ofrecerle un viaje a un conductor que acaba de apagarlo (hasta que la ventana de heartbeat de 30s expire por sí sola). Este spec revierte esa decisión puntual: persiste el estado en `profiles.en_linea` y lo suma como condición extra en `despachar_viaje`, sin tocar el resto del despacho (1×1, TTL de oferta de 20s, heartbeat, timeout de 10min del Spec 24).

## Alcance

**Incluye:**

- `supabase/migrations/0025_en_linea.sql`: columna `profiles.en_linea boolean not null default true`, y `create or replace function public.despachar_viaje(...)` con la condición nueva `and p.en_linea = true` sumada a las existentes del candidato (perfil completo, heartbeat reciente, no excluido, no ocupado). El resto de la función queda igual que en la 0024 (timeout de 10 minutos incluido).
- `app/actions/conductor.ts`: nueva Server Action `marcarEnLinea(enLinea: boolean)` que actualiza `profiles.en_linea` del conductor logueado (mismo patrón que `heartbeat()`: update directo a `profiles`, sin RPC, validando rol conductor).
- `lib/perfil.ts`: sumar `en_linea` al `select` de `getPerfil` para poder leer el valor inicial.
- `lib/supabase/types.ts`: sumar `en_linea: boolean` a `Profile`.
- `app/conducir/page.tsx`: pasar `enLineaInicial={profile.en_linea}` a `PanelConductor`.
- `app/conducir/panel-conductor.tsx`:
  - El estado `disponible` arranca desde la prop `enLineaInicial` (ya no hardcodeado en `true`), así refleja lo que quedó guardado la última vez.
  - El `onClick` del switch persiste el cambio llamando a `marcarEnLinea(nuevoValor)` además de actualizar el estado local.
  - Se mantiene igual que hoy: el switch queda deshabilitado mientras hay un viaje asignado (`disabled={viaje !== null}`); mientras está apagado, el `tick()` sigue sin llamar `heartbeat()` ni `ofertaActual()` (ya es el comportamiento actual), sólo sigue consultando `viajeAsignado()`.

**Fuera de alcance (para specs futuros):**

- Detección automática de desconexión (cerrar la pestaña, perder la red, cerrar el navegador): si el conductor se va sin apagar el switch, `en_linea` queda en `true` en la base; sólo el heartbeat (ventana de 30s, sin cambios de este spec) lo saca de la candidatura por inactividad, igual que hoy.
- Apagarse mientras tiene un viaje asignado (`aceptada`/`en_curso`): el switch sigue deshabilitado en ese caso, como ya hace la UI actual.
- Historial de cuándo un conductor se puso en línea/fuera de línea (no se guarda ninguna marca de tiempo del cambio, sólo el booleano actual).
- Notificar al conductor por qué no recibe viajes (ya hoy el panel muestra "No estás recibiendo viajes" cuando `disponible` es `false`; sin cambios).
- Apagado automático por inactividad prolongada (ej. "llevás 2 horas en línea sin viajes, ¿seguís conectado?"): no entra en este spec.

## Modelo de datos

Migración `supabase/migrations/0025_en_linea.sql`. Idempotente (columna con `if not exists` + `create or replace function`, sin tocar enums ni otras tablas). Se aplica a mano desde el SQL Editor del dashboard, de una sola vez.

### Columna `profiles.en_linea`

```sql
alter table public.profiles
  add column if not exists en_linea boolean not null default true;
```

Default `true` para que un conductor que nunca tocó el switch (o cuya fila ya existía antes de esta migración) siga comportándose exactamente como hoy: disponible por default, sólo gateado por el heartbeat.

### `despachar_viaje` con la condición `en_linea`

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
  select estado, created_at into v_estado, v_created_at
    from public.trips where id = p_trip_id for update;
  if not found or v_estado <> 'pendiente' then
    return;
  end if;

  -- Timeout del Spec 24: sin cambios.
  if v_created_at <= now() - interval '10 minutes' then
    update public.trips set estado = 'cancelada' where id = p_trip_id;
    update public.trip_offers
      set estado = 'vencida'
      where trip_id = p_trip_id and estado = 'ofrecida';
    return;
  end if;

  update public.trip_offers
    set estado = 'vencida'
    where trip_id = p_trip_id and estado = 'ofrecida' and expira_at <= now();

  if exists (
    select 1 from public.trip_offers
    where trip_id = p_trip_id and estado = 'ofrecida' and expira_at > now()
  ) then
    return;
  end if;

  -- SPEC 25: sólo se ofrece a quien está "en línea" (en_linea = true), además
  -- de las condiciones ya existentes (perfil completo, heartbeat, exclusión, ocupación).
  select p.id into v_next
  from public.profiles p
  join public.vehicles v on v.conductor_id = p.id
  where p.role = 'conductor'
    and p.nombre is not null
    and p.telefono is not null
    and p.en_linea = true
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

Todo lo demás (`aceptar_oferta`, `rechazar_oferta`, `iniciar_viaje`, `finalizar_viaje`, `bajarse_viaje`, `cancelar_viaje`) queda **sin cambios**: `en_linea` sólo afecta a quién puede recibir una oferta nueva, no a las transiciones de un viaje ya asignado.

### `marcarEnLinea` (`app/actions/conductor.ts`)

```ts
// Persiste el switch "En línea/Fuera de línea" del encabezado de /conducir.
// Mismo patrón que heartbeat(): update directo (no RPC), acotado al propio
// conductor. El despacho (despachar_viaje) exige en_linea = true para ofrecer.
export async function marcarEnLinea(enLinea: boolean): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("profiles")
    .update({ en_linea: enLinea })
    .eq("id", user.id)
    .eq("role", "conductor");
}
```

### `Profile` (`lib/supabase/types.ts`)

```ts
export type Profile = {
  // …campos existentes…
  en_linea: boolean;
};
```

### `getPerfil` (`lib/perfil.ts`)

Sumar `en_linea` al `select` existente:

```ts
.select("id, role, nombre, telefono, en_linea, created_at")
```

### `panel-conductor.tsx`: estado inicial y persistencia

```tsx
export default function PanelConductor({
  nombre,
  enLineaInicial,
}: {
  nombre: string;
  enLineaInicial: boolean;
}) {
  const [disponible, setDisponible] = useState(enLineaInicial);
  // …

  const toggleDisponible = () => {
    const nuevo = !disponible;
    setDisponible(nuevo);
    startTransition(() => {
      marcarEnLinea(nuevo);
    });
  };

  // en el switch:
  // onClick={toggleDisponible}
```

`ConducirPage` pasa `enLineaInicial={profile.en_linea}` (siempre `true` salvo que el conductor se haya apagado antes).

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Commit 1 — este spec.** `specs/25-en-linea-conductor.md`.

2. **Migración.** `supabase/migrations/0025_en_linea.sql` (columna `en_linea` + `create or replace function despachar_viaje`). Aplicarla en Supabase. *Verificación (SQL Editor):* `select en_linea from profiles where role='conductor' limit 1;` devuelve `true` para un conductor existente; con `update profiles set en_linea = false where id = '<id>'`, ese conductor deja de aparecer como candidato en `despachar_viaje` aun con `last_seen_at` fresco.

3. **Tipos + `getPerfil`.** Sumar `en_linea` a `Profile` (`lib/supabase/types.ts`) y al `select` de `getPerfil` (`lib/perfil.ts`). *Verificación:* `npm run lint` pasa.

4. **`marcarEnLinea`.** Nueva Server Action en `app/actions/conductor.ts`. *Verificación:* `npm run build` compila.

5. **Wiring en `/conducir`.** `app/conducir/page.tsx` pasa `enLineaInicial`; `panel-conductor.tsx` arranca `disponible` desde esa prop y el switch llama `marcarEnLinea` al togglear. *Verificación:* ver Caso de prueba.

6. **Prueba end-to-end.** Ver "Caso de prueba". *Verificación:* todos los criterios de aceptación, más `npm run build` y `npm run lint`.

## Caso de prueba

Precondición: `npm run dev` en `http://localhost:3000`, migración 0025 aplicada, una cuenta conductor (C) con perfil completo y una cuenta pasajero (P).

| # | Paso | Resultado esperado |
| --- | --- | --- |
| 1 | Como C, abrir `/conducir` por primera vez (sin tocar el switch antes). | El switch muestra "Disponible" / encendido (default `en_linea = true`). |
| 2 | Como C, apagar el switch ("No disponible"). | El switch pasa a apagado; el panel muestra "No estás recibiendo viajes". |
| 3 | En el SQL Editor: `select en_linea from profiles where id = '<id de C>';`. | `false`. |
| 4 | Como P, solicitar un viaje con C como único conductor activo (heartbeat fresco) pero `en_linea = false`. | El viaje queda `pendiente` sin oferta; C no recibe nada en `/conducir`. |
| 5 | Como C, recargar `/conducir` (sin tocar el switch). | El switch sigue apagado (persistió entre recargas), coherente con el paso 3. |
| 6 | Como C, prender el switch de nuevo. | En el próximo poll del pasajero (≤5s), C recibe la oferta del viaje del paso 4. |
| 7 | Como C, aceptar la oferta (queda con un viaje `aceptada`). | El switch queda deshabilitado (igual que hoy) mientras dura el viaje. |
| 8 | Finalizar el viaje y apagar el switch de nuevo. | El switch vuelve a ser editable y queda apagado; `en_linea = false` en la base. |

## Criterios de aceptación

- [ ] Existe la columna `profiles.en_linea` (`boolean not null default true`).
- [ ] `despachar_viaje` no ofrece un viaje a un conductor con `en_linea = false`, aunque tenga `last_seen_at` reciente y perfil completo.
- [ ] El switch de `/conducir` persiste el valor en `profiles.en_linea` al togglearlo (vía `marcarEnLinea`).
- [ ] Al recargar `/conducir`, el switch refleja el valor guardado en la base, no siempre "en línea".
- [ ] El switch sigue deshabilitado mientras el conductor tiene un viaje asignado (`aceptada`/`en_curso`), igual que antes de este spec.
- [ ] Un conductor que nunca tocó el switch (o que ya existía antes de la migración) sigue recibiendo ofertas igual que antes (default `true`).
- [ ] El resto del despacho (TTL de oferta 20s, heartbeat, exclusión de candidatos, timeout de 10min del Spec 24) funciona exactamente igual que antes.
- [ ] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** `en_linea` es una condición **adicional** a la presencia por heartbeat en `despachar_viaje` (`and p.en_linea = true`, sumado a `and p.last_seen_at > now() - interval '30 seconds'`). **No:** reemplazar el heartbeat. El heartbeat sigue siendo la señal de "la pestaña está viva"; `en_linea` es la decisión explícita del conductor. Si cierra la pestaña sin apagar el switch, en 30s deja de ser candidato igual que hoy, sin depender de que alguien lo apague a mano.
- **Sí:** el estado persiste en `profiles.en_linea` y se lee al abrir `/conducir` (`enLineaInicial`). **No:** que el switch siempre arranque "en línea" al entrar a la pantalla. Si el conductor se fue "fuera de línea" y cierra la pestaña, al volver sigue fuera de línea hasta que lo prenda él mismo — es el comportamiento que pidió el feature.
- **Sí:** el switch sigue deshabilitado mientras hay un viaje asignado (`disabled={viaje !== null}`, sin cambios respecto de hoy). **No:** permitir apagarse en plena `aceptada`/`en_curso`. Evita que el conductor se declare "fuera de línea" en medio de un viaje activo, que no tiene efecto práctico sobre ese viaje (ya asignado) y podría confundir sobre su estado real.
- **Sí:** mientras está apagado, se detienen `heartbeat()` y `ofertaActual()` en el poll (comportamiento ya existente del switch de React), sólo sigue `viajeAsignado()`. **No:** seguir mandando heartbeat estando fuera de línea. No hay ninguna razón para refrescar `last_seen_at` de alguien que explícitamente no quiere ofertas; menos escrituras innecesarias.
- **Sí:** default `true` en la columna nueva. **No:** default `false`. Evita que, el día que se aplica la migración, todos los conductores existentes dejen de recibir viajes hasta que alguien toque el switch; el comportamiento nuevo (presencia explícita) se vuelve efectivo recién cuando el conductor decide apagarse por primera vez.
- **Sí:** `marcarEnLinea` hace un update directo a `profiles` (mismo patrón que `heartbeat()`), no una RPC `security definer`. **No:** una función Postgres dedicada. Es un self-update de una columna propia sobre una fila que el conductor ya puede escribir (misma policy de `profiles` que usa `heartbeat`); no hay lógica que proteger con `security definer` como sí la hay en las transiciones de `trips`/`trip_offers`.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El conductor cierra la pestaña o pierde conexión sin apagar el switch: `en_linea` queda `true` en la base. | El heartbeat (sin cambios) lo excluye de la candidatura a los ~30s de inactividad, igual que ya pasa hoy sin este spec. `en_linea` es un filtro adicional, no el único. |
| El update optimista del switch (`setDisponible` antes de que `marcarEnLinea` confirme) podría desincronizarse si la escritura falla silenciosamente (sin conexión, sesión vencida). | Mismo riesgo que ya acepta `heartbeat()` hoy (también falla silencioso); el próximo toggle o recarga vuelve a sincronizar con la base. No se agrega manejo de error nuevo porque el resto del panel ya sigue este criterio. |
| Migrar conductores existentes con default `true` significa que, en los hechos, nada cambia hasta que un conductor use el switch por primera vez. | Es la intención: la migración no debe apagar a nadie por sorpresa; el cambio de comportamiento es opt-in por conductor. |

## Lo que **no** entra en este spec

- Detección automática de desconexión (cierre de pestaña, pérdida de red).
- Apagarse con un viaje asignado en curso.
- Historial de cambios de en línea/fuera de línea.
- Apagado automático por inactividad prolongada.

Cada uno de esos, si aterriza, va en su propio spec.
