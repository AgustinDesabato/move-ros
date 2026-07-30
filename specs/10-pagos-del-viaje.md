# SPEC 10 — Pagos del viaje (registro y comisión)

> **Estado:** aprobado
> **Depende de:** SPEC 01, SPEC 02, SPEC 04, SPEC 05, SPEC 07, SPEC 09
> **Fecha:** 2026-07-30
> **Objetivo:** Registrar el pago de cada viaje finalizado —con el método elegido al solicitar (efectivo o digital, simulado, sin pasarela real), una comisión de plataforma configurable en código, y el neto yendo al conductor o, si pertenece a una remisería, a la empresa— guardándolo en una tabla nueva `pagos`, confirmando el efectivo el conductor y el digital automáticamente, y mostrando el recibo al pasajero, el neto al conductor, el recaudado real en `/empresa` y el detalle de pago en `/viajes`.

Este spec cierra el ciclo del dinero que el resto de la app venía dejando abierto: hasta ahora el viaje tenía una `tarifa_estimada` (Spec 04) pero nadie "pagaba" nada, y el Spec 09 mostraba a la empresa una "suma de tarifas" que evitaba a propósito llamarse "recaudado" porque no había cobro real. Acá aparece el **asiento de pago**: al finalizar un viaje se crea una fila en una tabla nueva `pagos` con el monto (la tarifa), la **comisión de plataforma** (una constante en código) y el **neto** que recibe el destinatario. El destinatario es el conductor si es independiente, o su **remisería** si pertenece a una —el acoplamiento crítico que el roadmap pedía dejar resuelto antes de la capa 2 de flota—. Todo es **simulado**: no hay pasarela real ni movimiento de plata. El método (efectivo/digital) lo elige el pasajero al solicitar; ambos **liquidan al finalizar** (el digital queda pagado al instante, el efectivo espera a que el conductor confirme "Cobrado"). La pasarela real, el pre-pago del digital, los reembolsos, el reparto interno empresa↔conductor y las liquidaciones quedan explícitamente fuera.

## Alcance

**Incluye:**

- Migración SQL `supabase/migrations/0010_pagos.sql` (idempotente):
  - Dos enums nuevos: `metodo_pago` (`efectivo`, `digital`) y `pago_estado` (`pendiente`, `pagado`).
  - Columna nueva en `trips`: `metodo_pago public.metodo_pago not null default 'efectivo'` (el método que el pasajero eligió al solicitar).
  - Tabla nueva `public.pagos`: una fila por viaje (`trip_id` unique), con `destinatario_id`, `monto` (lo que paga el pasajero = `tarifa_estimada`), `comision`, `neto`, `estado` y `pagado_at`.
  - RLS en `pagos`: el pasajero, el conductor y la empresa dueña del conductor pueden leer la fila de su viaje; nadie escribe directo (todo va por RPC `security definer`).
  - RPC `registrar_pago(p_trip_id, p_comision, p_neto)` (`security definer`): valida que quien llama sea el conductor del viaje y que esté `finalizada`, resuelve el `destinatario_id` (empresa del conductor si tiene `empresa_id`, si no el propio conductor), fija `estado` según el método (`digital`→`pagado`, `efectivo`→`pendiente`) e inserta la fila (idempotente por el unique).
  - RPC `confirmar_cobro(p_trip_id)` (`security definer`): el conductor marca un pago `pendiente` (efectivo) como `pagado` (setea `pagado_at`).
  - RPC `empresa_conductores()` recreada: reemplaza `suma_tarifas_hoy` por `recaudado_hoy` = suma del `neto` de los pagos **pagados** del día (ahora sí "recaudado", con comisión descontada).
  - RPC `historial_viajes()` recreada: agrega `metodo_pago`, `pago_estado` y `pago_neto` por viaje.
- **Cálculo del reparto en código** (`lib/pagos.ts`, nuevo): `COMISION_PLATAFORMA` (constante, ej. `0.20`) y `calcularReparto(tarifa)` → `{ comision, neto }` (redondeo a pesos enteros), espejando cómo `lib/tarifa.ts` concentra la lógica de tarifa.
- **Tipos TypeScript** (`lib/supabase/types.ts`, extendido): `MetodoPago`, `PagoEstado`, `Pago`; `Trip` gana `metodo_pago`; `EmpresaConductor` cambia `suma_tarifas_hoy`→`recaudado_hoy`; `ViajeHistorial` gana `metodo_pago`, `pago_estado`, `pago_neto`.
- **Helper de formato** (`lib/formato.ts`, extendido): `metodoPago(m)` → "Efectivo" / "Digital" (reusa el formateo de `$` existente).
- **Selección de método al solicitar** (`app/viajar/selector-viaje.tsx`): selector efectivo/digital junto al resumen de tarifa; `solicitarViaje` (en `app/actions/viaje.ts`) recibe el método y lo guarda en `trips.metodo_pago`.
- **Registro del pago al finalizar** (`app/actions/conductor.ts`): `finalizarViaje` calcula el reparto con `lib/pagos.ts` y llama `registrar_pago`; nueva acción `confirmarCobro(tripId)` → RPC `confirmar_cobro`.
- **Recibo del pasajero** (`app/viajar/viaje-pendiente.tsx`): durante el viaje muestra método + total; al pasar a `finalizada`, el recibo (total pagado, método).
- **Neto y cobro del conductor** (`app/conducir/panel-conductor.tsx`): al finalizar muestra el neto que recibe; si el método es efectivo, botón "Cobrado" (`confirmarCobro`).
- **Pago en el historial** (`app/viajes/fila-viaje.tsx`): cada viaje finalizado muestra método, monto y estado del pago (pagado/pendiente).
- **Recaudado real en `/empresa`** (`app/empresa/gestion-conductores.tsx`): la columna del día pasa de "suma de tarifas" a "recaudado" (neto pagado), cerrando lo que el Spec 09 dejó pendiente.

**Fuera de alcance (para specs futuros):**

- **Pasarela de pago real** (MercadoPago u otra): credenciales, checkout/redirect, webhooks, estados pendiente/aprobado/rechazado, PCI. Acá todo pago digital es **simulado** (se marca `pagado` sin cobro real).
- **Pre-pago del digital al solicitar** (pre-autorización): en el MVP ambos métodos liquidan al finalizar. El cobro anticipado va con la pasarela real.
- **Reembolsos / anulaciones:** un viaje `cancelada` no genera pago; no hay flujo de devolución (no hace falta porque nada se cobra antes de finalizar).
- **Reparto interno empresa↔conductor:** cuánto retiene la remisería a su conductor. Acá el destinatario del neto es la empresa (o el conductor si es independiente); el reparto es capa 2.
- **Liquidaciones / payouts / transferencias** reales a conductores o empresas: no hay movimiento de dinero, sólo el asiento del pago.
- **Recálculo de la tarifa** por distancia/tiempo real al finalizar: el monto cobrado es la `tarifa_estimada` del Spec 04, sin recomputar.
- **Comisión por-empresa o editable desde una UI:** la comisión es una constante única de plataforma en código.
- **Propinas, cupones, descuentos, split de pago** entre varios pasajeros.
- **Dashboards de ingresos** por rango/histórico/exportación (capa 2 de remiserías).

## Modelo de datos

Migración `supabase/migrations/0010_pagos.sql`. Idempotente (segura de re-ejecutar).

### Enums nuevos

```sql
-- Método elegido por el pasajero al solicitar.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'metodo_pago') then
    create type public.metodo_pago as enum ('efectivo', 'digital');
  end if;
end$$;

-- Estado del asiento de pago. 'pendiente' = efectivo sin confirmar; 'pagado' =
-- efectivo confirmado por el conductor o digital (simulado) liquidado al finalizar.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'pago_estado') then
    create type public.pago_estado as enum ('pendiente', 'pagado');
  end if;
end$$;
```

### Columna de método en `trips`

```sql
-- Método que el pasajero eligió al solicitar. default 'efectivo' cubre viajes
-- previos a esta migración sin romper. El asiento de pago (tabla pagos) se crea
-- recién al finalizar; esta columna sólo guarda la elección.
alter table public.trips
  add column if not exists metodo_pago public.metodo_pago not null default 'efectivo';
```

### Tabla nueva `pagos`

Una fila = el pago de un viaje. El `trip_id unique` garantiza un solo asiento por viaje.

```sql
create table if not exists public.pagos (
  id              uuid primary key default gen_random_uuid(),
  trip_id         uuid not null unique references public.trips(id) on delete cascade,
  destinatario_id uuid not null references public.profiles(id) on delete cascade,
  monto           integer not null,  -- lo que paga el pasajero (= trips.tarifa_estimada)
  comision        integer not null,  -- comisión de plataforma (COMISION_PLATAFORMA)
  neto            integer not null,  -- monto - comision (lo que recibe el destinatario)
  estado          public.pago_estado not null,
  created_at      timestamptz not null default now(),
  pagado_at       timestamptz         -- instante en que quedó 'pagado' (null si pendiente)
);

create index if not exists pagos_destinatario_idx on public.pagos (destinatario_id);
```

Convención: `destinatario_id` es el conductor si es independiente, o su empresa (`profiles.empresa_id`) si pertenece a una. `monto = comision + neto`. `pagado_at` se setea cuando `estado` pasa a `pagado`. Un pago no se edita salvo la transición `pendiente → pagado`; el `on delete cascade` sólo limpia si se borra el viaje o el perfil destinatario.

### RLS de `pagos`

Nadie escribe directo (todo va por RPC `security definer`). El select se abre a las tres partes del pago:

```sql
alter table public.pagos enable row level security;

-- Leer: el pasajero o el conductor del viaje, o la empresa dueña del conductor.
create policy pagos_select on public.pagos
  for select using (
    destinatario_id = auth.uid()  -- conductor independiente o empresa destinataria
    or exists (
      select 1 from public.trips t
      where t.id = pagos.trip_id
        and (t.pasajero_id = auth.uid() or t.conductor_id = auth.uid())
    )
  );
```

*(No hay policies de insert/update: `registrar_pago` y `confirmar_cobro` son `security definer` y hacen toda la validación, igual que `calificar_viaje` en el Spec 08.)*

### RPC `registrar_pago(p_trip_id, p_comision, p_neto)`

`security definer`. La llama el conductor al finalizar. Resuelve destinatario y estado; el monto lo lee del viaje (no confía en un monto de parámetro).

```sql
create or replace function public.registrar_pago(
  p_trip_id  uuid,
  p_comision integer,
  p_neto     integer
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_trip   public.trips;
  v_emp    uuid;
  v_dest   uuid;
  v_estado public.pago_estado;
begin
  select * into v_trip from public.trips where id = p_trip_id;
  if v_trip.id is null or v_trip.estado <> 'finalizada'
     or v_trip.conductor_id <> auth.uid() then
    raise exception 'viaje inexistente, no finalizado, o no sos el conductor';
  end if;

  -- destinatario: la empresa del conductor si pertenece a una, si no el conductor
  select empresa_id into v_emp from public.profiles where id = v_trip.conductor_id;
  v_dest := coalesce(v_emp, v_trip.conductor_id);

  -- digital: pagado (simulado) al instante; efectivo: pendiente hasta confirmar
  v_estado := case v_trip.metodo_pago when 'digital' then 'pagado' else 'pendiente' end;

  insert into public.pagos (trip_id, destinatario_id, monto, comision, neto, estado, pagado_at)
  values (
    p_trip_id, v_dest, v_trip.tarifa_estimada, p_comision, p_neto, v_estado,
    case when v_estado = 'pagado' then now() else null end
  )
  on conflict (trip_id) do nothing;
end;
$$;
```

### RPC `confirmar_cobro(p_trip_id)`

`security definer`. El conductor confirma que cobró el efectivo.

```sql
create or replace function public.confirmar_cobro(p_trip_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.pagos p
     set estado = 'pagado', pagado_at = now()
    from public.trips t
   where p.trip_id = p_trip_id
     and t.id = p.trip_id
     and t.conductor_id = auth.uid()
     and p.estado = 'pendiente';
end;
$$;
```

### RPC `empresa_conductores()` recreada

Parte del cuerpo del Spec 09 y cambia la métrica de dinero: en vez de sumar `tarifa_estimada`, suma el `neto` de los pagos **pagados** del día. Como cambia una columna de retorno (`suma_tarifas_hoy`→`recaudado_hoy`), la migración hace `drop function` + `create` (Postgres no deja cambiar el `returns table` con `create or replace`).

```sql
-- returns table (id, nombre, email, finalizadas_hoy, recaudado_hoy) -- antes: suma_tarifas_hoy
-- el join a pagos reemplaza al sum(tarifa_estimada):
--   left join public.pagos pg on pg.trip_id = t.id and pg.estado = 'pagado'
--   ... coalesce(sum(pg.neto), 0)::integer as recaudado_hoy
-- se mantiene el corte de día local de Argentina sobre t.cerrado_at.
```

### RPC `historial_viajes()` recreada

Parte del cuerpo del Spec 08 (que ya trae `ya_calificado` y `contraparte`) y agrega tres columnas de pago. También cambia el `returns table` → `drop`+`create`.

```sql
-- columnas nuevas en el returns / select:
--   metodo_pago  public.metodo_pago  -- t.metodo_pago
--   pago_estado  public.pago_estado  -- pg.estado (null si el viaje no tiene pago, ej. cancelada)
--   pago_neto    integer             -- pg.neto  (null si no hay pago)
-- vía left join public.pagos pg on pg.trip_id = t.id
```

### Cálculo del reparto (`lib/pagos.ts`, nuevo)

```ts
// Comisión de plataforma sobre cada tarifa. Constante única (MVP); una comisión
// por-empresa o editable sería otro spec. Espeja lib/tarifa.ts.
export const COMISION_PLATAFORMA = 0.2; // 20%

// Reparto de una tarifa en pesos enteros. La comisión se redondea; el neto es el resto.
export function calcularReparto(tarifa: number): { comision: number; neto: number } {
  const comision = Math.round(tarifa * COMISION_PLATAFORMA);
  return { comision, neto: tarifa - comision };
}
```

### Tipos TypeScript (`lib/supabase/types.ts`, extendido)

```ts
export type MetodoPago = "efectivo" | "digital";
export type PagoEstado = "pendiente" | "pagado";

// Trip gana el método elegido al solicitar.
export type Trip = {
  // …campos previos…
  metodo_pago: MetodoPago;
};

// Una fila de pagos.
export type Pago = {
  id: string;
  trip_id: string;
  destinatario_id: string;
  monto: number;
  comision: number;
  neto: number;
  estado: PagoEstado;
  created_at: string;
  pagado_at: string | null;
};

// EmpresaConductor: suma_tarifas_hoy -> recaudado_hoy (neto pagado del día).
export type EmpresaConductor = {
  id: string;
  nombre: string | null;
  email: string;
  finalizadas_hoy: number;
  recaudado_hoy: number;
};

// ViajeHistorial gana el detalle de pago (null si el viaje no tiene pago).
export type ViajeHistorial = {
  // …campos previos…
  metodo_pago: MetodoPago;
  pago_estado: PagoEstado | null;
  pago_neto: number | null;
};
```

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Migración.** Escribir y ejecutar `supabase/migrations/0010_pagos.sql`: enums `metodo_pago` y `pago_estado`, columna `trips.metodo_pago`, tabla `pagos` + índice + RLS de select, RPC `registrar_pago`, RPC `confirmar_cobro`, y `empresa_conductores`/`historial_viajes` recreadas (`drop`+`create`) con las columnas nuevas. *Verificación (SQL Editor):* sobre un viaje `finalizada` propio, `select registrar_pago('<id>', <comision>, <neto>)` crea la fila con el `destinatario_id` correcto (conductor independiente vs. empresa) y `estado` según el método; llamarla dos veces no duplica; `confirmar_cobro` pasa un efectivo `pendiente` a `pagado`; `empresa_conductores()` devuelve `recaudado_hoy`; `historial_viajes()` trae `metodo_pago`/`pago_estado`/`pago_neto`.

2. **Reparto en código.** Crear `lib/pagos.ts` con `COMISION_PLATAFORMA` y `calcularReparto(tarifa)`. *Verificación:* `calcularReparto(1000)` con 0.20 da `{ comision: 200, neto: 800 }`; `npm run lint` pasa.

3. **Tipos.** En `lib/supabase/types.ts`: `MetodoPago`, `PagoEstado`, `Pago`; `Trip` gana `metodo_pago`; `EmpresaConductor` cambia a `recaudado_hoy`; `ViajeHistorial` gana `metodo_pago`/`pago_estado`/`pago_neto`. *Verificación:* `npm run lint` pasa (el cambio de `recaudado_hoy` obliga a actualizar la vista `/empresa`, que se hace en el paso 8).

4. **Formato.** En `lib/formato.ts`: `metodoPago(m: MetodoPago): string` → "Efectivo"/"Digital". *Verificación:* ambos valores devuelven el string esperado.

5. **Método al solicitar.** En `app/actions/viaje.ts`: `solicitarViaje` recibe `metodo: MetodoPago` y lo agrega al `insert` de `trips`. En `app/viajar/selector-viaje.tsx`: selector efectivo/digital junto al resumen de tarifa, que se pasa a `solicitarViaje`. *Verificación:* solicitar un viaje eligiendo cada método guarda `trips.metodo_pago` correcto.

6. **Registro del pago al finalizar.** En `app/actions/conductor.ts`: `finalizarViaje` —después del RPC `finalizar_viaje`— lee la tarifa del viaje, calcula el reparto con `calcularReparto` y llama `registrar_pago(tripId, comision, neto)`; y nueva acción `confirmarCobro(tripId)` → RPC `confirmar_cobro`. *Verificación:* al finalizar un viaje se crea la fila en `pagos`; un digital queda `pagado`, un efectivo `pendiente`.

7. **UI del conductor: neto y cobro.** En `app/conducir/panel-conductor.tsx`: al pasar el viaje a `finalizada`, mostrar el neto que recibe el conductor; si el método es efectivo y el pago está `pendiente`, botón "Cobrado" que llama `confirmarCobro` y refresca. *Verificación:* el conductor ve su neto; con efectivo, "Cobrado" pasa el pago a pagado; con digital, ya aparece pagado sin botón.

8. **Recaudado real en `/empresa`.** En `app/empresa/gestion-conductores.tsx` (y `page.tsx` si hace falta): la columna del día pasa de "suma de tarifas" a **"recaudado"** (`recaudado_hoy`, neto pagado). *Verificación:* `/empresa` muestra "recaudado" con la comisión descontada; un pago aún `pendiente` (efectivo sin cobrar) no suma al recaudado.

9. **Recibo del pasajero.** En `app/viajar/viaje-pendiente.tsx`: durante el viaje, mostrar método + total; al pasar a `finalizada`, el recibo (total pagado + método). *Verificación:* el pasajero ve el método elegido durante el viaje y el recibo al finalizar.

10. **Pago en el historial.** En `app/viajes/fila-viaje.tsx`: por cada viaje finalizado, mostrar método, monto y estado del pago (pagado/pendiente), reusando `metodoPago` y el formateo de `$`. *Verificación:* un viaje digital muestra "Digital · pagado"; un efectivo sin cobrar, "Efectivo · pendiente"; un `cancelada` no muestra pago.

11. **Prueba end-to-end.** Con dos sesiones: solicitar un viaje eligiendo **digital**, completarlo (aceptar→iniciar→finalizar) y verificar que el pago queda `pagado`, el conductor ve su neto, el pasajero el recibo, y aparece en `/viajes`. Repetir con **efectivo**: el pago queda `pendiente` hasta que el conductor toca "Cobrado". Con un conductor de una **remisería**: verificar que el `destinatario_id` es la empresa y que `/empresa` muestra "recaudado" (neto) del día, y que un efectivo sin cobrar no suma. Cancelar un viaje y confirmar que **no** genera pago. *Verificación:* todos los criterios de aceptación.

## Criterios de aceptación

- [ ] Existen los enums `metodo_pago` (`efectivo`/`digital`) y `pago_estado` (`pendiente`/`pagado`), y la columna `trips.metodo_pago` (not null, default `efectivo`).
- [ ] Existe la tabla `public.pagos` con `trip_id` **unique** (un solo pago por viaje), RLS activa y la policy de select (pasajero, conductor o empresa destinataria).
- [ ] Al solicitar un viaje, el método elegido (efectivo/digital) se guarda en `trips.metodo_pago`.
- [ ] Al finalizar un viaje, `registrar_pago` crea una fila en `pagos` con `monto = trips.tarifa_estimada`, `comision` + `neto` según `calcularReparto`, y `monto = comision + neto`.
- [ ] El `destinatario_id` del pago es la **empresa** del conductor si tiene `empresa_id`, o el **conductor** si es independiente.
- [ ] Un pago **digital** queda en `estado = 'pagado'` (con `pagado_at`) apenas se finaliza el viaje.
- [ ] Un pago **efectivo** queda en `estado = 'pendiente'` hasta que el conductor confirma; `confirmar_cobro` lo pasa a `pagado` y setea `pagado_at`.
- [ ] `registrar_pago` rechaza (excepción) si el viaje no está `finalizada` o si quien llama no es el conductor del viaje.
- [ ] Llamar `registrar_pago` dos veces sobre el mismo viaje **no** duplica ni pisa el pago (unique `trip_id` + `on conflict do nothing`).
- [ ] Un viaje `cancelada` **no** genera fila en `pagos`.
- [ ] `confirmar_cobro` sólo funciona para el conductor del viaje y sólo sobre un pago `pendiente`.
- [ ] `calcularReparto(1000)` con `COMISION_PLATAFORMA = 0.20` devuelve `{ comision: 200, neto: 800 }` (pesos enteros).
- [ ] El **conductor**, al finalizar, ve el **neto** que recibe; con efectivo aparece el botón "Cobrado" (que confirma el pago); con digital, el pago ya figura pagado sin botón.
- [ ] El **pasajero** ve el método durante el viaje y un **recibo** (total pagado + método) al finalizar.
- [ ] `/viajes` muestra por cada viaje finalizado el método, el monto y el estado del pago (pagado/pendiente); un `cancelada` no muestra pago.
- [ ] `/empresa` muestra **"recaudado"** del día (`recaudado_hoy` = suma del `neto` de pagos **pagados**), con la comisión ya descontada; ya no dice "suma de tarifas".
- [ ] Un pago efectivo aún `pendiente` (sin cobrar) **no** suma al "recaudado" de `/empresa`.
- [ ] Una empresa no ve pagos de conductores de **otra** empresa (RLS de `pagos` + acotación por `auth.uid()` en las RPC).
- [ ] La experiencia previa no se rompe: el despacho, la tarifa y las calificaciones funcionan igual; los viajes previos a la migración tienen `metodo_pago = 'efectivo'` por default.
- [ ] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** pago **simulado** (sin pasarela real). **No:** integrar MercadoPago ahora. Todo el resto de la app es simulado (tarifa estimada, sin cobro), así que el pago se modela entero —monto, comisión, neto, destinatario, estado— pero sin mover plata. La pasarela real (credenciales, checkout, webhooks, PCI) es su propio spec.
- **Sí:** ambos métodos **liquidan al finalizar**. **No:** cobrar el digital al solicitar. Al solicitar todavía no hay conductor asignado (el despacho es posterior), así que no se conoce el destinatario ni el reparto; y cobrar antes abriría el caso de reembolso al cancelar. Como es simulado, el pre-pago no mueve plata real: recién rinde con pre-autorización real, que va con la pasarela.
- **Sí:** el **método se elige al solicitar** (`trips.metodo_pago`). **No:** elegirlo al finalizar. El pasajero decide cómo paga antes de subir, como en apps reales; el asiento se registra al cerrar, pero la elección ya está tomada.
- **Sí:** el monto cobrado es la **`tarifa_estimada`** del Spec 04. **No:** recalcular la tarifa por distancia/tiempo real al finalizar. Mantiene una sola fuente del precio, ya autoritativa (la recalcula el servidor al solicitar); el recálculo por trayecto real es otro spec.
- **Sí:** comisión de plataforma como **constante en código** (`lib/pagos.ts`). **No:** tabla de config en la DB ni comisión por-empresa. Espeja `lib/tarifa.ts`, es versionada y sin superficie de admin; una comisión editable o por-empresa es capa 2.
- **Sí:** el reparto (`comision`/`neto`) se calcula en la **Server Action** y se pasa a `registrar_pago`, que **lee el `monto` del viaje**. **No:** calcular la comisión en SQL. Sigue el patrón del repo (el número autoritativo se computa en el servidor —`solicitarViaje` recalcula la tarifa— y se guarda en la tabla); leer el monto de la DB evita confiar un importe arbitrario.
- **Sí:** el **destinatario** es la empresa si el conductor pertenece a una, si no el conductor. **No:** modelar el reparto interno empresa↔conductor. Es el acoplamiento crítico que el roadmap pedía dejar resuelto (payee = conductor o empresa + comisión); cuánto retiene la empresa a su conductor es capa 2.
- **Sí:** el **efectivo lo confirma el conductor** ("Cobrado"); el **digital es automático** al finalizar. **No:** confirmación siempre automática ni siempre del pasajero. Refleja quién tiene la plata en la mano: el conductor cobra el efectivo, y no queremos marcar "pagado" un efectivo que quizás no cobró.
- **Sí:** una tabla nueva **`pagos`**, una fila por viaje. **No:** columnas de pago en `trips`. Normaliza el asiento (monto/comisión/neto/estado/destinatario) sin ensuciar `trips`, y deja lugar para que un spec de payouts agregue liquidaciones sin tocar el viaje.
- **Sí:** `metodo` vive **sólo en `trips`**. **No:** duplicarlo en `pagos`. La elección existe antes de que haya pago (desde el request); las RPC que arman el recibo ya leen de `trips`, así que el método sale de ahí sin una columna redundante.
- **Sí:** renombrar `suma_tarifas_hoy`→**`recaudado_hoy`** (neto pagado) en `/empresa`. **No:** dejar "suma de tarifas". Es el cierre que el Spec 09 dejó explícito ("no se llama recaudado todavía porque no hay cobro"): ahora sí hay comisión descontada y un estado de pago real.
- **Sí:** un viaje `cancelada` **no genera pago**. **No:** crear un pago en $0 o `anulado`. Sin cobro anticipado, un viaje que no ocurrió no tiene nada que asentar; evita un estado extra y todo flujo de reembolso.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `finalizarViaje` hace **dos llamadas** (RPC `finalizar_viaje` + `registrar_pago`): si la segunda falla o la app crashea en el medio, queda un viaje `finalizada` **sin** pago. | `registrar_pago` es idempotente (unique `trip_id` + `on conflict do nothing`) y valida `estado = 'finalizada'`, así que se puede reintentar sin duplicar. Si molesta un hueco transitorio, un spec futuro puede mover el asiento adentro de `finalizar_viaje`. Se acepta el hueco en el MVP. |
| La comisión vive en **dos formas** conceptuales: la constante en `lib/pagos.ts` y los valores ya guardados en filas de `pagos`. Cambiar `COMISION_PLATAFORMA` no reescribe los pagos viejos. | Es correcto y deseado: cada pago guarda el `comision`/`neto` **con el que se cobró** (snapshot histórico). El recaudado de `/empresa` suma los netos guardados, no recomputa; cambiar la constante sólo afecta pagos nuevos. |
| Las RPC `security definer` (`registrar_pago`, `confirmar_cobro`) escriben plata: un bug en el `where`/validación permitiría registrar o confirmar pagos de viajes ajenos. | Ambas validan `conductor_id = auth.uid()` y el estado del viaje/pago antes de escribir, e infieren el destinatario del propio viaje (no lo reciben por parámetro). Se verifica en el paso end-to-end que un tercero no puede registrar ni confirmar. |
| Recrear `empresa_conductores` (renombrando `suma_tarifas_hoy`→`recaudado_hoy`) y `historial_viajes` con `drop`+`create` podría dejar la app rota entre el deploy del front y la migración, o pisar lo que les sumaron specs previos. | La migración parte del cuerpo **actual** de cada función y sólo cambia/agrega columnas; el front degrada si aún no se aplicó (recaudado en 0, pago null → "sin pago"). Se aplica la migración antes de mergear el front, igual que en specs anteriores. |
| Un pago **efectivo** puede quedar `pendiente` para siempre si el conductor nunca toca "Cobrado" (olvido o mala fe), inflando la brecha entre tarifas y recaudado. | Es aceptable en el MVP: refleja la realidad (el efectivo no cobrado no es recaudado). El `pago_estado` lo deja visible en `/viajes` y `/empresa`; recordatorios o cierre automático son de un spec futuro. |
| El corte de "recaudado del día" en `/empresa` sobre pagos `pagado`: un efectivo cobrado **al otro día** podría contar el día de la confirmación, no el del viaje. | El corte se ancla a `trips.cerrado_at` (día del viaje), **no** a `pagado_at` (día del cobro), consistente con "finalizados del día" del Spec 09: las dos columnas de `/empresa` hablan del mismo conjunto de viajes. Un efectivo confirmado tarde igual cuenta al día del viaje. |

## Lo que **no** entra en este spec

- Pasarela de pago real (MercadoPago u otra): checkout, webhooks, estados de aprobación, PCI.
- Pre-pago del digital al solicitar (pre-autorización); acá ambos métodos liquidan al finalizar.
- Reembolsos / anulaciones (un `cancelada` no genera pago).
- Reparto interno empresa↔conductor (cuánto retiene la remisería); acá el destinatario es la empresa o el conductor.
- Liquidaciones / payouts / transferencias reales de dinero.
- Recálculo de la tarifa por distancia/tiempo real al finalizar.
- Comisión por-empresa o editable desde una UI.
- Propinas, cupones, descuentos, split de pago.
- Dashboards de ingresos por rango/histórico/exportación.

Cada uno de esos, si aterriza, va en su propio spec (la pasarela real y el reparto de flota son los candidatos naturales del roadmap).
