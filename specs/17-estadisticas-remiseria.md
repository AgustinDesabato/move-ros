# SPEC 17 — Estadísticas de la remisería

> **Estado:** en curso
> **Depende de:** SPEC 09, SPEC 10, SPEC 11
> **Fecha:** 2026-10-01
> **Objetivo:** Que la remisería vea cómo le va en el período que elija (hoy, esta semana o este mes): viajes y recaudado del período, en total y por conductor, en `/empresa`, con los indicadores calculados por la base de datos en vez de sumarlos a mano en la página.

Hoy `/empresa` (P12) sólo muestra el **día**: la RPC `empresa_conductores()` (Spec 09, recreada en las migraciones 0010 y 0012) devuelve por conductor los viajes finalizados de hoy y la plata cobrada de hoy, y `app/empresa/page.tsx` suma esas filas con `reduce` para armar los tres indicadores de arriba. El Spec 09 dejó explícitamente fuera de alcance "rangos de fechas, históricos e ingresos por período". Este spec cubre esa parte: un selector **Hoy / Semana / Mes** en el panel, y dos RPC nuevas que calculan el rango de fechas y todas las cifras —por conductor y totales— en Postgres.

Además corrige un detalle de atribución: `empresa_conductores()` cuenta los viajes de los conductores que **hoy** están en la flota. Si la remisería quita a un conductor, la plata que ya cobró por sus viajes desaparece del panel. Las estadísticas nuevas atribuyen cada viaje según el **destinatario del pago** (`pagos.destinatario_id`, Spec 10), que queda fijo al finalizar el viaje: lo que cobró la remisería sigue contando aunque el conductor ya no esté.

## Alcance

**Incluye:**

- Migración `supabase/migrations/0017_estadisticas_empresa.sql` (idempotente):
  - Función `rango_periodo(p_periodo text)`: traduce `'hoy' | 'semana' | 'mes'` a un rango de días locales de Argentina (`desde`, `hasta`, ambos inclusive).
  - RPC `empresa_estadisticas_conductores(p_periodo text)` (`security definer`): una fila por conductor —los de la flota actual, aunque no tengan viajes, más los ex conductores con viajes cobrados por la remisería en el período— con viajes, facturado, comisión, recaudado y efectivo pendiente de confirmar.
  - RPC `empresa_resumen(p_periodo text)` (`security definer`): una sola fila con el rango y los totales del período, calculados **sobre** `empresa_estadisticas_conductores` (así el total coincide siempre con la suma de las filas).
- **Tipos** (`lib/supabase/types.ts`): `Periodo`, `EstadisticaConductor` (reemplaza a `EmpresaConductor`) y `ResumenEmpresa`.
- **Helper** `lib/periodo.ts` (nuevo): lista de períodos, validación del search param y textos ("Hoy", "Esta semana", "Este mes"; rango "29 sept – 1 oct").
- **Server Actions** (`app/actions/empresa.ts`): `getResumen(periodo)` y `getEstadisticasConductores(periodo)` reemplazan a `getConductores()`.
- **`/empresa`** (`app/empresa/page.tsx`):
  - Lee el período de `?periodo=` (`hoy` por defecto; un valor inválido cae a `hoy`).
  - Selector segmentado **Hoy · Semana · Mes** hecho con `<Link>` (sin JS de cliente); el período elegido queda en la URL.
  - Los indicadores (conductores con viajes / flota, viajes, recaudación neta) salen de `empresa_resumen`, sin `reduce`. Debajo, el desglose del período: facturado, comisión de plataforma y efectivo a confirmar.
- **Lista de conductores** (`app/empresa/gestion-conductores.tsx`): el badge y las cifras de cada conductor pasan a ser del período elegido. Los ex conductores con actividad en el período aparecen al final con la marca "Ya no está en la flota", sin "Quitar" ni lista de viajes.

**Fuera de alcance (para specs futuros):**

- Rango de fechas libre (elegir "desde" y "hasta" con un calendario). Las RPC ya trabajan con un rango; sólo falta la UI y un parámetro nuevo.
- Comparar contra el período anterior ("+12 % vs. la semana pasada").
- Gráficos (viajes por día, recaudado por día).
- Exportar a CSV/planilla.
- Estadísticas para el conductor independiente (su propio resumen en `/conducir`).
- Métricas de cancelaciones, kilómetros recorridos o calificaciones por período.
- Filtrar la lista "Ver viajes" de cada conductor por el período (sigue mostrando sus últimos viajes cerrados).

## Modelo de datos

Migración `supabase/migrations/0017_estadisticas_empresa.sql`. Sin tablas ni columnas nuevas: sólo funciones. Se aplica a mano desde el SQL Editor, como las anteriores.

### Qué cuenta y cómo

- **Un viaje es de la remisería** si tiene un asiento en `pagos` con `destinatario_id` = la remisería y el viaje está `finalizada`. Todo viaje finalizado desde el Spec 10 tiene su asiento (lo crea `finalizarViaje` → `registrar_pago`).
- **Fecha del viaje:** `trips.cerrado_at` en hora de Argentina (`America/Argentina/Buenos_Aires`), el mismo corte que ya usaba el panel.
- **Períodos** (días locales, ambos extremos inclusive, `hasta` = hoy):
  - `hoy`: sólo hoy.
  - `semana`: desde el **lunes** de esta semana.
  - `mes`: desde el **día 1** de este mes.
- **Cifras** (en pesos enteros, como el resto del modelo):
  - `viajes`: viajes finalizados del período, cobrados o no.
  - `facturado`, `comision`, `recaudado`: suma de `monto`, `comision` y `neto` de los pagos **`pagado`**. Se cumple `facturado = recaudado + comision` (mismo invariante que la migración 0012).
  - `pendiente_cobro`: suma de `monto` de los pagos **`pendiente`** (efectivo que el conductor todavía no confirmó).

### Función `rango_periodo(p_periodo)`

```sql
create or replace function public.rango_periodo(p_periodo text)
returns table (desde date, hasta date)
language plpgsql
stable
set search_path = public
as $$
declare
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  case p_periodo
    when 'hoy'    then desde := v_hoy;
    when 'semana' then desde := date_trunc('week',  v_hoy)::date;  -- lunes
    when 'mes'    then desde := date_trunc('month', v_hoy)::date;
    else raise exception 'período inválido: %', p_periodo;
  end case;
  hasta := v_hoy;
  return next;
end;
$$;
```

### RPC `empresa_estadisticas_conductores(p_periodo)`

`security definer`. Sólo la puede usar una empresa; filtra todo por `auth.uid()`.

```sql
create or replace function public.empresa_estadisticas_conductores(p_periodo text)
returns table (
  id              uuid,
  nombre          text,
  email           text,
  en_flota        boolean,
  viajes          integer,
  facturado       integer,
  comision        integer,
  recaudado       integer,
  pendiente_cobro integer
)
language plpgsql
stable
security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if (select pr.role from public.profiles pr where pr.id = auth.uid())
     is distinct from 'empresa' then
    raise exception 'sólo una empresa puede ver estas estadísticas';
  end if;

  return query
  with r as (select * from public.rango_periodo(p_periodo)),
  v as (
    select t.conductor_id, pg.monto, pg.comision, pg.neto, pg.estado
      from public.pagos pg
      join public.trips t on t.id = pg.trip_id
      cross join r
     where pg.destinatario_id = auth.uid()
       and t.estado = 'finalizada'
       and (t.cerrado_at at time zone 'America/Argentina/Buenos_Aires')::date
           between r.desde and r.hasta
  ),
  c as (
    select p.id as conductor_id from public.profiles p where p.empresa_id = auth.uid()
    union
    select v.conductor_id from v
  )
  select c.conductor_id,
         p.nombre,
         u.email::text,
         coalesce(p.empresa_id = auth.uid(), false),
         count(v.conductor_id)::integer,
         coalesce(sum(v.monto)    filter (where v.estado = 'pagado'),    0)::integer,
         coalesce(sum(v.comision) filter (where v.estado = 'pagado'),    0)::integer,
         coalesce(sum(v.neto)     filter (where v.estado = 'pagado'),    0)::integer,
         coalesce(sum(v.monto)    filter (where v.estado = 'pendiente'), 0)::integer
    from c
    join public.profiles p on p.id = c.conductor_id
    join auth.users u      on u.id = c.conductor_id
    left join v            on v.conductor_id = c.conductor_id
   group by c.conductor_id, p.nombre, u.email, p.empresa_id
   order by 4 desc, 5 desc, p.nombre;
end;
$$;
```

Orden: primero la flota actual, dentro de ella los que más viajes hicieron; los ex conductores al final.

### RPC `empresa_resumen(p_periodo)`

`security definer`. Agrega sobre la RPC anterior, así hereda el control de rol y el total cuadra con las filas.

```sql
create or replace function public.empresa_resumen(p_periodo text)
returns table (
  desde                 date,
  hasta                 date,
  viajes                integer,
  conductores_con_viajes integer,
  conductores_flota     integer,
  facturado             integer,
  comision              integer,
  recaudado             integer,
  pendiente_cobro       integer
)
language sql
stable
security definer set search_path = public
as $$
  select r.desde, r.hasta,
         coalesce(sum(e.viajes), 0)::integer,
         (count(*) filter (where e.viajes > 0))::integer,
         (count(*) filter (where e.en_flota))::integer,
         coalesce(sum(e.facturado), 0)::integer,
         coalesce(sum(e.comision), 0)::integer,
         coalesce(sum(e.recaudado), 0)::integer,
         coalesce(sum(e.pendiente_cobro), 0)::integer
    from public.rango_periodo(p_periodo) r
    left join public.empresa_estadisticas_conductores(p_periodo) e on true
   group by r.desde, r.hasta;
$$;
```

`empresa_conductores()` queda en la base sin uso desde la app (no se borra: no molesta y evita romper un deploy anterior mientras conviven versiones).

### Tipos TypeScript (`lib/supabase/types.ts`)

```ts
export type Periodo = "hoy" | "semana" | "mes";

// Una fila de empresa_estadisticas_conductores(p_periodo).
export type EstadisticaConductor = {
  id: string;
  nombre: string | null;
  email: string;
  en_flota: boolean;        // false = ex conductor con viajes cobrados en el período
  viajes: number;
  facturado: number;
  comision: number;
  recaudado: number;
  pendiente_cobro: number;
};

// La fila de empresa_resumen(p_periodo).
export type ResumenEmpresa = {
  desde: string;            // 'YYYY-MM-DD', día local de Argentina
  hasta: string;
  viajes: number;
  conductores_con_viajes: number;
  conductores_flota: number;
  facturado: number;
  comision: number;
  recaudado: number;
  pendiente_cobro: number;
};
```

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Commit 1 — este spec.** `specs/17-estadisticas-remiseria.md`.
2. **Migración.** `supabase/migrations/0017_estadisticas_empresa.sql` con `rango_periodo`, `empresa_estadisticas_conductores` y `empresa_resumen`. *Verificación (SQL Editor):* `select * from rango_periodo('semana')` devuelve el lunes de esta semana y hoy; `rango_periodo('año')` tira "período inválido".
3. **Tipos, helper y actions.** `Periodo`, `EstadisticaConductor`, `ResumenEmpresa` en `lib/supabase/types.ts` (sale `EmpresaConductor`); `lib/periodo.ts`; `getResumen` y `getEstadisticasConductores` en `app/actions/empresa.ts` (sale `getConductores`). *Verificación:* `npm run lint` pasa.
4. **Panel.** `app/empresa/page.tsx` lee `searchParams.periodo`, pide resumen + conductores + invitaciones en paralelo, renderiza el selector y los indicadores del resumen. `gestion-conductores.tsx` recibe `EstadisticaConductor[]` y el texto del período. *Verificación:* cambiar de pestaña cambia la URL y las cifras.
5. **Prueba end-to-end.** Ver "Caso de prueba". *Verificación:* criterios de aceptación, `npm run build` y `npm run lint`.

## Caso de prueba

Precondición: migración `0017` aplicada; `npm run dev` corriendo; una remisería con dos conductores en la flota (A y B) y un pasajero.

| # | Paso | Resultado esperado |
| --- | --- | --- |
| 1 | Entrar a `/empresa` como la remisería. | Pestaña **Hoy** activa; los indicadores coinciden con los que mostraba el panel antes de este spec. |
| 2 | Hacer un viaje con A pagado por **transferencia** y finalizarlo. Recargar. | Hoy: 1 viaje, A con "1"; recaudación neta = neto de ese viaje; facturado = recaudado + comisión. |
| 3 | Hacer un viaje con B en **efectivo** y finalizarlo **sin** confirmar el cobro. | Viajes sube a 2; recaudación no cambia; "Efectivo a confirmar" muestra la tarifa de ese viaje. |
| 4 | Como B, confirmar el cobro. Recargar `/empresa`. | "Efectivo a confirmar" vuelve a $0 y la recaudación suma el neto del viaje de B. |
| 5 | Tocar **Semana** y después **Mes**. | La URL pasa a `?periodo=semana` / `?periodo=mes`; se ve el rango ("29 sept – 1 oct"); las cifras son ≥ las de hoy. |
| 6 | Entrar a `/empresa?periodo=cualquiercosa`. | Se muestra **Hoy**, sin error. |
| 7 | Quitar a A de la flota. Mirar Hoy. | Las cifras totales **no bajan**; A aparece al final con "Ya no está en la flota", sin botón "Quitar"; "Flota" muestra 1. |
| 8 | Entrar con **otra** remisería. | No ve los viajes ni la plata de la primera. |
| 9 | Como pasajero o conductor, entrar a `/empresa`. | Redirige a su vista, igual que antes. |

## Criterios de aceptación

- [ ] `/empresa` tiene un selector Hoy / Semana / Mes; el período elegido queda en la URL (`?periodo=`) y Hoy es el valor por defecto.
- [ ] Un `?periodo=` inválido muestra Hoy sin romper la página.
- [ ] Semana va del lunes de esta semana a hoy; Mes, del día 1 a hoy; los cortes son en hora de Argentina.
- [ ] Los indicadores del panel salen de `empresa_resumen`: la página no suma cifras a mano.
- [ ] Por conductor se ven viajes, facturado, recaudado, comisión y efectivo pendiente **del período elegido**.
- [ ] El total de viajes y de recaudado coincide con la suma de las filas de conductores.
- [ ] Facturado = recaudado + comisión, en el total y en cada conductor.
- [ ] El efectivo sin confirmar cuenta como viaje pero no como recaudado; aparece como "Efectivo a confirmar".
- [ ] Quitar a un conductor no borra del panel lo que la remisería ya cobró por sus viajes; el ex conductor se lista como "Ya no está en la flota".
- [ ] Una remisería nunca ve viajes ni montos de otra; un usuario que no es empresa recibe error de la RPC.
- [ ] Invitar, cancelar invitación, quitar conductor y "Ver viajes" funcionan igual que antes.
- [ ] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** calcular el rango de fechas en Postgres (`rango_periodo`). **No:** calcularlo en TypeScript y mandar fechas. El corte de día ya vive en la base en hora de Argentina; calcularlo en Node dependería de la zona del servidor.
- **Sí:** períodos de calendario (desde el lunes, desde el día 1). **No:** "últimos 7 / 30 días". Es como habla una remisería ("cómo vamos esta semana", "el mes") y coincide con cuándo se liquida.
- **Sí:** el período por **search param** con `<Link>`. **No:** estado de cliente. La página sigue siendo Server Component, el período se puede compartir/recargar, y no hace falta una action extra para recargar.
- **Sí:** atribuir por `pagos.destinatario_id`. **No:** por la flota actual (`profiles.empresa_id`), como hacía `empresa_conductores`. El destinatario queda fijo al cobrar; con la flota actual, quitar a un conductor borraba su recaudación del historial de la empresa.
- **Sí:** `empresa_resumen` agrega sobre `empresa_estadisticas_conductores`. **No:** dos consultas independientes. Garantiza que el total sea la suma de las filas y no duplica el filtro de seguridad.
- **Sí:** mostrar el efectivo pendiente aparte. **No:** sumarlo al recaudado. Todavía no es plata cobrada; pero sin mostrarlo, un viaje "aparece" en la cuenta de viajes y "falta" en la plata sin explicación.
- **Sí:** no borrar `empresa_conductores()`. **No:** `drop function`. No molesta y deja funcionando un deploy anterior mientras se aplica la migración.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Viajes finalizados antes del Spec 10 no tienen asiento en `pagos` y no cuentan. | Son datos de prueba previos al cobro; el panel anterior tampoco los contaba como plata. Aceptable. |
| Si `registrar_pago` fallara al finalizar, ese viaje no aparece en las estadísticas. | Es el mismo asiento del que ya depende la recaudación desde el Spec 10. No se agrega un camino alternativo. |
| `empresa_estadisticas_conductores` es `security definer` y lee `auth.users` y `pagos` ajenos. | Valida el rol `empresa` y filtra por `destinatario_id = auth.uid()` / `empresa_id = auth.uid()`; proyecta sólo nombre, email y cifras. Se verifica en el paso 8 del caso de prueba. |
| El mes con muchos viajes hace la consulta más pesada que la del día. | Se apoya en `pagos_destinatario_idx`; el volumen de una remisería por mes es chico. Si crece, un índice sobre `trips (cerrado_at)` lo resuelve. |
| `date_trunc('week', …)` empieza la semana el lunes (ISO). | Es lo esperado en Argentina; queda documentado acá y en el criterio de aceptación. |

## Notas de implementación

- **SQL sin probar contra la base real.** La migración se escribió y revisó, pero no se pudo ejecutar acá (no hay CLI de Supabase vinculado ni Postgres local). Se aplica a mano desde el SQL Editor y se valida con el paso 2 del plan y el caso de prueba.
- **`#variable_conflict use_column`** en `empresa_estadisticas_conductores`: las columnas de salida (`id`, `nombre`, `viajes`, …) son variables en plpgsql y chocarían con columnas de la consulta; además el CTE de conductores expone `conductor_id` en vez de `id`.
- **Selector con `<Link replace scroll={false}>`.** Cambiar de período no apila entradas en el historial ni salta al principio de la página. `Hoy` apunta a `/empresa` sin query.
- **Fallo de la RPC.** Si `empresa_resumen` falla (p. ej. la migración todavía no está aplicada), el panel muestra "No se pudieron cargar las estadísticas" en lugar de cifras en cero.
- **Ex conductores.** Su fila muestra las cifras del período pero no "Ver viajes" ni "Quitar": `empresa_viajes_conductor` (Spec 09) sólo devuelve viajes de la flota actual.

## Lo que **no** entra en este spec

- Rango de fechas libre con calendario.
- Comparación contra el período anterior.
- Gráficos y exportación.
- Estadísticas para el conductor independiente.
- Cancelaciones, kilómetros o calificaciones por período.

Cada uno de esos, si aterriza, va en su propio spec (el rango libre es el candidato natural).
