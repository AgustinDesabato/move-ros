# SPEC 31 — Emergencia para el conductor

> **Estado:** implementado
> **Depende de:** SPEC 05, SPEC 12, SPEC 23
> **Fecha:** 2026-10-08
> **Objetivo:** Que el conductor tenga en su vista de viaje (`/conducir`) el mismo botón "Emergencia · llamar al 911" que el pasajero tiene desde el Spec 12: abre el marcador con el 911 y en paralelo registra una alerta con su ubicación, que soporte ve en `/soporte/alertas` (Spec 23).

El Spec 12 dejó explícitamente fuera el botón de emergencia del lado del conductor ("el conductor no tiene P07"). Hoy el conductor sí tiene una vista de viaje equivalente: la tarjeta "Viaje aceptado" / "Viaje en curso" de `app/conducir/panel-conductor.tsx` (Spec 05). Este spec le suma ahí el mismo botón.

Hoy no alcanza con copiar el botón: la policy de insert de `alertas_emergencia` (`0014_seguridad.sql`) sólo deja registrar una alerta si quien llama es el **pasajero** del viaje, así que la alerta del conductor fallaría en silencio. Y `/soporte/alertas` no distingue quién la disparó.

## Alcance

**Incluye:**

- **Migración** `supabase/migrations/0031_emergencia_conductor.sql` (idempotente):
  - Reemplaza la policy de insert de `alertas_emergencia`: se puede registrar una alerta sobre un viaje donde quien llama es el **pasajero o el conductor** (`trips.pasajero_id = auth.uid() or trips.conductor_id = auth.uid()`).
  - Recrea la RPC `alertas_soporte()` (Spec 23) sumando la columna `rol` (el `role` de quien disparó la alerta).
- **Componente compartido** `components/boton-emergencia.tsx` (nuevo, Client Component): el enlace `tel:911` con el registro de la alerta en paralelo. Es el código que hoy vive en `app/viajar/viaje-pendiente.tsx` (función `emergencia` + el `<a>`), movido sin cambios de comportamiento.
- **Pasajero** (`app/viajar/viaje-pendiente.tsx`): usa `<BotonEmergencia tripId={trip.id} />` en lugar del enlace propio. Se ve y funciona igual.
- **Conductor** (`app/conducir/panel-conductor.tsx`): la tarjeta de viaje asignado (`aceptada` y `en_curso`) suma `<BotonEmergencia tripId={viaje.id} />` debajo de los botones de acción.
- **Soporte** (`app/soporte/alertas/vista-alertas.tsx`): cada fila muestra una etiqueta "Pasajero" o "Conductor" según quién disparó la alerta.
- **Tipos** (`lib/supabase/types.ts`): `AlertaSoporte` suma `rol: UserRole`.
- **Comentario** de `registrarAlerta` (`app/actions/seguridad.ts`): dice "del pasajero o del conductor". La firma no cambia.

**Fuera de alcance (para specs futuros):**

- "Compartir viaje" para el conductor (contactos de confianza por SMS). El conductor ya puede cargar contactos en `/perfil/contactos` (la pantalla no filtra por rol), pero el pedido es sólo el botón de emergencia.
- Botón de emergencia con una oferta entrante (P11) o sin viaje: no hay `trip_id` al que asociar la alerta.
- Avisar a la remisería del conductor o al pasajero del viaje que hubo una alerta.
- Cambios en el mapa de `/soporte/alertas` (los marcadores siguen iguales).

## Modelo de datos

Sin tablas ni columnas nuevas. Cambian la policy de insert de `alertas_emergencia` y el tipo de retorno de `alertas_soporte()`.

### Migración `0031_emergencia_conductor.sql`

Idempotente, se aplica a mano desde el SQL Editor del dashboard y se puede pegar entera en una sola ejecución.

```sql
-- SPEC 31 — Emergencia para el conductor
-- Idempotente: segura de re-ejecutar.

-- ============================================================================
-- 1) El conductor del viaje también puede registrar una alerta
-- ============================================================================
-- Reemplaza "El pasajero registra su alerta" (0014): ahora vale para el
-- pasajero o el conductor del trip_id insertado.
drop policy if exists "El pasajero registra su alerta" on public.alertas_emergencia;
drop policy if exists "Pasajero o conductor registran su alerta" on public.alertas_emergencia;
create policy "Pasajero o conductor registran su alerta"
  on public.alertas_emergencia for insert
  with check (
    auth.uid() = usuario_id
    and exists (
      select 1 from public.trips t
       where t.id = trip_id
         and (t.pasajero_id = auth.uid() or t.conductor_id = auth.uid())
    )
  );

-- ============================================================================
-- 2) Soporte ve quién disparó la alerta
-- ============================================================================
-- Cambia el tipo de retorno (suma rol), así que hay que dropear antes:
-- create or replace no puede cambiar las columnas de una función que
-- devuelve table.
drop function if exists public.alertas_soporte();
create function public.alertas_soporte()
returns table (
  id             uuid,
  trip_id        uuid,
  usuario_id     uuid,
  nombre_usuario text,
  email          text,
  rol            public.user_role,
  origen_label   text,
  destino_label  text,
  ubic_lat       double precision,
  ubic_lng       double precision,
  created_at     timestamptz
)
language sql
security definer set search_path = public
as $$
  select a.id, a.trip_id, a.usuario_id, p.nombre, u.email, p.role,
         t.origen_label, t.destino_label, a.ubic_lat, a.ubic_lng, a.created_at
    from public.alertas_emergencia a
    join public.profiles p on p.id = a.usuario_id
    join auth.users      u on u.id = a.usuario_id
    join public.trips    t on t.id = a.trip_id
   where (select role from public.profiles where id = auth.uid()) = 'soporte'
   order by a.created_at desc;
$$;
```

`rol` es el rol **actual** de quien disparó la alerta, no una foto del momento. Alcanza: el rol no se cambia desde la app.

### Tipos TypeScript (`lib/supabase/types.ts`)

```ts
export type AlertaSoporte = {
  // …lo de antes…
  rol: UserRole;
};
```

### Componente (`components/boton-emergencia.tsx`)

```tsx
"use client";

// Enlace "Emergencia · llamar al 911" (Spec 12, compartido con el conductor
// en el Spec 31). Registra la alerta en paralelo sin bloquear la llamada.
export default function BotonEmergencia({ tripId }: { tripId: string })
```

Mismas clases, ícono y texto que el enlace actual de P07. El `<a href="tel:911">` sigue navegando aunque el registro falle.

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Commit 1 — este spec.** `specs/31-emergencia-conductor.md`.
2. **Migración.** `supabase/migrations/0031_emergencia_conductor.sql` y aplicarla en Supabase. *Verificación (SQL Editor):* corre dos veces sin error; filas 5 y 6 del caso de prueba.
3. **Componente, pasajero, conductor y soporte.** `components/boton-emergencia.tsx`, `viaje-pendiente.tsx` lo usa, `panel-conductor.tsx` lo suma, `vista-alertas.tsx` muestra el rol, `types.ts` suma `rol`. *Verificación:* filas 1 a 4 del caso de prueba; `npm run lint` y `npm run build` pasan.
4. **Prueba end-to-end.** Ver "Caso de prueba". *Verificación:* todos los criterios de aceptación.

## Caso de prueba

Precondición: `npm run dev` corriendo en `http://localhost:3000`, migración 0031 aplicada, un pasajero (P), un conductor (C) y una cuenta de soporte (S).

| # | Paso | Resultado esperado |
| --- | --- | --- |
| 1 | Como P, pedir un viaje; como C, aceptarlo. Como C, en `/conducir`. | La tarjeta "Viaje aceptado" muestra "Emergencia · llamar al 911" debajo de "Bajarme" / "Iniciar viaje". |
| 2 | Como C, tocar "Emergencia". | Se abre el marcador con 911 y queda una fila en `alertas_emergencia` con `usuario_id = C` y el `trip_id` del viaje (con ubicación o `null`). |
| 3 | Como C, "Iniciar viaje". | La tarjeta "Viaje en curso" también muestra el botón, debajo de "Finalizar viaje". |
| 4 | Como S, abrir `/soporte/alertas`. | La alerta de C aparece con la etiqueta "Conductor". Una alerta de P (tocar "Emergencia" en P07) aparece con "Pasajero". |
| 5 | En el SQL Editor, como C (`set local role authenticated` + claims de C), insertar una alerta con el `trip_id` de un viaje donde C no es ni pasajero ni conductor. | Falla por RLS. |
| 6 | Igual que 5, como P sobre su propio viaje. | Funciona (el pasajero sigue pudiendo, como en el Spec 12). |
| 7 | Como C, con una oferta entrante y sin viaje asignado. | No hay botón de emergencia. |

## Criterios de aceptación

- [ ] En `/conducir`, con un viaje `aceptada` o `en_curso`, el conductor ve "Emergencia · llamar al 911" con el mismo aspecto que en P07.
- [ ] Tocarlo abre `tel:911` y registra una fila en `alertas_emergencia` con el conductor como `usuario_id` (con ubicación si el navegador la dio, `null` si no).
- [ ] Con una oferta entrante o sin viaje, el conductor no ve el botón.
- [ ] El conductor sólo puede registrar alertas sobre viajes donde es el `conductor_id`; el pasajero sigue pudiendo sobre los suyos; nadie puede sobre un viaje ajeno.
- [ ] El botón de P07 (pasajero) se ve y se comporta igual que antes.
- [ ] `/soporte/alertas` muestra en cada alerta si la disparó un pasajero o un conductor.
- [ ] La migración 0031 corre dos veces seguidas sin error.
- [ ] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** un componente compartido `BotonEmergencia`. **No:** copiar el enlace y la función `emergencia` en `panel-conductor.tsx`. El pedido es "el mismo botón"; con un solo componente no pueden divergir.
- **Sí:** el botón aparece en `aceptada` y en `en_curso`. **No:** sólo en `en_curso`. En P07 el pasajero lo ve desde que el viaje está aceptado; el conductor yendo a buscar al pasajero también puede estar en riesgo.
- **Sí:** ampliar la policy de insert existente. **No:** una RPC `security definer` para el conductor. Sigue siendo "cada uno registra lo suyo sobre un viaje propio", RLS directa alcanza (misma razón que en el Spec 12).
- **Sí:** mostrar el rol en `/soporte/alertas`. **No:** dejar soporte igual. Con alertas de los dos lados, soporte necesita saber quién pidió ayuda para saber a quién llamar.
- **Sí:** sin "Compartir viaje" para el conductor. **No:** sumarlo en este spec. No está en el pedido.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La migración no se aplica y la alerta del conductor falla en silencio por RLS. | El 911 se marca igual (no depende del registro), como en el Spec 12. Fila 2 del caso de prueba verifica la fila en la tabla. |
| Entre el `drop` y el `create` de `alertas_soporte()`, `/soporte/alertas` falla. | La migración corre en una sola transacción desde el SQL Editor. |
| El botón suma altura a la tarjeta del conductor y tapa más mapa. | Es un solo enlace de la misma altura que en P07, que ya convive con el mapa. |

## Lo que **no** entra en este spec

- "Compartir viaje" para el conductor.
- Emergencia sin viaje asignado.
- Notificar a la remisería o al pasajero.
- Cambios en el mapa de alertas de soporte.

Cada uno de esos, si aterriza, va en su propio spec.
