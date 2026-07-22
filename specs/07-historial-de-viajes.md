# SPEC 07 — Historial de viajes

> **Estado:** Implementado
> **Depende de:** SPEC 01, SPEC 02, SPEC 03, SPEC 04, SPEC 05
> **Fecha:** 2026-07-22
> **Objetivo:** Que pasajero y conductor puedan ver, en una vista `/viajes`, la lista de sus viajes cerrados (finalizados y cancelados) con su detalle —origen, destino, distancia, tarifa, fecha, estado y el **nombre de la contraparte** (el conductor que lo llevó, o el pasajero que llevó)—, ordenados del más reciente al más viejo, sin polling ni tiempo real.

Este spec agrega la primera vista **retrospectiva** de la app. Hasta ahora todo era el viaje *activo* (solicitar, despachar, seguir en vivo); acá se cierra el ciclo mostrando lo que ya pasó. Es una feature casi enteramente de **lectura**: la tabla `trips` ya guarda todos los datos del viaje. Se agrega en la base un `cerrado_at` para saber **cuándo** terminó cada viaje (hoy sólo existe `created_at`, la hora de la solicitud) y una RPC `historial_viajes()` (`security definer`) que trae los viajes cerrados del usuario **con el nombre de la contraparte** en un solo round-trip —necesaria porque la RLS de `profiles` no deja que un rol lea el perfil del otro directo. El resto es una ruta nueva `/viajes` y un par de enlaces de navegación.

## Alcance

**Incluye:**

- Migración SQL `supabase/migrations/0007_historial.sql` (idempotente):
  - Columna nueva en `trips`: `cerrado_at timestamptz` (nullable; null = el viaje todavía no cerró). Marca el momento en que el viaje pasó a `finalizada` o `cancelada`.
  - Extender las RPC `finalizar_viaje` y `cancelar_viaje` (ambas `security definer`, ya existentes) para setear `cerrado_at = now()` del **servidor** al cerrar el viaje. `bajarse_viaje` **no** lo setea (devuelve el viaje a `pendiente`, no lo cierra).
  - RPC nueva `historial_viajes()` (`security definer`): devuelve los viajes cerrados (`finalizada`/`cancelada`) donde el usuario actual es pasajero **o** conductor, ordenados por cierre descendente y acotados a 50, con una columna `contraparte` = el **nombre de la otra persona** (el conductor si mirás como pasajero, el pasajero si mirás como conductor). Es `security definer` porque cruza a `profiles`, que la RLS no deja leer al otro rol; valida `auth.uid()` en el `where`, así cada uno sólo obtiene sus propios viajes.
- **Tipos TypeScript** (`lib/supabase/types.ts`, extendido): `Trip` gana `cerrado_at: string | null`, y se agrega el tipo `ViajeHistorial` (la fila que devuelve `historial_viajes`, con `contraparte`).
- **Ruta nueva `/viajes`** (`app/viajes/page.tsx`), Server Component, compartida por ambos roles:
  - Llama a la RPC `historial_viajes()`; la propia función resuelve, según el rol del usuario, qué viajes traer y el nombre de la contraparte. La vista no ramifica la consulta por rol: el servidor ya lo hace.
  - Cada fila muestra: origen (`origen_label`), destino (`destino_label`), distancia (km), tarifa (`tarifa_estimada` en $), fecha (`cerrado_at`), **contraparte** (nombre) y un **badge de estado** (Finalizado / Cancelado).
  - Estado vacío ("Todavía no tenés viajes") cuando la lista está vacía.
- **Componente de fila reutilizable** (`app/viajes/fila-viaje.tsx` o inline): presentación de un `ViajeHistorial`, reutilizando el formateo de distancia/tarifa/fecha que ya usa la app. Muestra la contraparte con un fallback ("Sin conductor" / "Sin pasajero") cuando el viaje se canceló sin llegar a tener contraparte.
- **Navegación:** enlace "Mis viajes" en el header de `/viajar` (pasajero) y de `/conducir` (conductor), apuntando a `/viajes`; y un enlace de vuelta desde `/viajes` a la vista principal según el rol.
- **Helper de formato de fecha** (`lib/formato.ts` o reusar el existente si ya hay uno): fecha corta y legible en español (p. ej. "22 jul 2026, 14:30").

**Fuera de alcance (para specs futuros):**

- Paginación / scroll infinito del historial (por ahora, los últimos 50 y listo).
- Filtros y búsqueda (por fecha, por estado, por dirección).
- Datos de la contraparte más allá del **nombre**: teléfono, vehículo, foto, enlace a su perfil. El historial muestra el nombre y nada más.
- Detalle expandido de un viaje individual (`/viajes/[id]`): mapa del recorrido, recibo, etc.
- Exportar / descargar el historial.
- Métricas o totales agregados (cuántos viajes, cuánto gastaste/ganaste este mes).
- Cualquier noción de **pago/cobro real**: la tarifa mostrada es la `tarifa_estimada` del Spec 04, no un monto cobrado.
- Historial de viajes `pendiente`/`aceptada`/`en_curso` (esos son el viaje *activo*, ya cubiertos por `/viajar` y `/conducir`).

## Modelo de datos

Migración `supabase/migrations/0007_historial.sql`. Idempotente (segura de re-ejecutar).

### Columna nueva en `trips`

Marca el instante de cierre del viaje. Hasta ahora sólo existía `created_at` (hora de la solicitud), que no distingue cuándo terminó realmente. El historial ordena y fecha por el cierre.

```sql
alter table public.trips
  add column if not exists cerrado_at timestamptz;
```

Convención: `cerrado_at` es null mientras el viaje está `pendiente`/`aceptada`/`en_curso`, y se setea con `now()` del servidor cuando pasa a `finalizada` o `cancelada`. No se vuelve a null (un viaje cerrado no se reabre; `bajarse_viaje` no cierra, vuelve a `pendiente`).

### Escritura de `cerrado_at`

Se agrega a las dos RPC de cierre existentes (mismo patrón con que el Spec 06 les sumó la limpieza de `ubic_*`):

```sql
-- dentro de finalizar_viaje: en_curso -> finalizada
update public.trips
   set estado = 'finalizada', cerrado_at = now()
 where id = p_trip_id and conductor_id = auth.uid() and estado = 'en_curso';

-- dentro de cancelar_viaje: pendiente/aceptada -> cancelada
update public.trips
   set estado = 'cancelada', cerrado_at = now()
 where id = p_trip_id and pasajero_id = auth.uid()
   and estado in ('pendiente', 'aceptada');
```

Los viajes ya cerrados **antes** de esta migración quedan con `cerrado_at = null`; el historial cae a `created_at` para fecharlos y ordenarlos (ver *Consulta*). No hace falta backfill.

### RPC `historial_viajes()` (el nombre de la contraparte)

El historial no se puede resolver con un `select` directo sobre `trips`, porque queremos el **nombre de la contraparte** y la RLS de `profiles` (Spec 01/02) sólo deja a cada usuario leer su propio perfil: el pasajero no puede leer el `nombre` del conductor por join directo, ni al revés. Por eso una RPC `security definer` que cruza a `profiles` internamente y valida `auth.uid()` en el `where`, devolviendo sólo lo justo (nombre, no teléfono ni nada más).

Una sola función sirve a los dos roles: el `where` matchea al usuario como pasajero **o** como conductor, y la columna `contraparte` elige el nombre del "otro" con un `case`.

```sql
-- Historial de viajes cerrados del usuario actual, con el nombre de la contraparte.
-- security definer: cruza a profiles (que la RLS no deja leer del otro rol) pero
-- se acota a los viajes del propio usuario vía auth.uid(). Devuelve sólo el nombre.
create or replace function public.historial_viajes()
returns table (
  id              uuid,
  origen_label    text,
  destino_label   text,
  distancia_m     integer,
  tarifa_estimada integer,
  estado          public.trip_status,
  cerrado_at      timestamptz,
  created_at      timestamptz,
  contraparte     text
)
language sql
security definer
set search_path = public
as $$
  select t.id, t.origen_label, t.destino_label, t.distancia_m, t.tarifa_estimada,
         t.estado, t.cerrado_at, t.created_at,
         case
           when t.pasajero_id = auth.uid() then cp.nombre   -- miro como pasajero -> conductor
           else pp.nombre                                    -- miro como conductor -> pasajero
         end as contraparte
    from public.trips t
    left join public.profiles cp on cp.id = t.conductor_id
    left join public.profiles pp on pp.id = t.pasajero_id
   where (t.pasajero_id = auth.uid() or t.conductor_id = auth.uid())
     and t.estado in ('finalizada', 'cancelada')
   order by coalesce(t.cerrado_at, t.created_at) desc
   limit 50;
$$;
```

El `limit 50` vive en la función (fuente de verdad del servidor, como los TTL del despacho), no replicado en TS. Los `left join` dejan `contraparte` en `null` cuando el viaje se canceló sin conductor asignado; la UI muestra un fallback. Se apoya en los índices ya existentes `trips_pasajero_estado_idx (pasajero_id, estado)` y `trips_conductor_estado_idx (conductor_id, estado)` del Spec 04/05.

*(No se agrega ninguna policy nueva: la RPC es `security definer` y hace la validación de propiedad en su `where`; las policies de `trips` del Spec 04/05 siguen tal cual para el resto de la app.)*

### Tipos TypeScript (`lib/supabase/types.ts`, extendido)

```ts
// Trip gana el instante de cierre.
export type Trip = {
  // …campos previos…
  estado: TripStatus;
  cerrado_at: string | null;   // nuevo: instante de cierre (null si aún activo)
  created_at: string;
};

// Una fila del historial, tal como la devuelve la RPC historial_viajes().
export type ViajeHistorial = {
  id: string;
  origen_label: string;
  destino_label: string;
  distancia_m: number;
  tarifa_estimada: number;
  estado: TripStatus;             // en la práctica sólo 'finalizada' | 'cancelada'
  cerrado_at: string | null;
  created_at: string;
  contraparte: string | null;     // nombre del conductor o del pasajero, según quién mira
};
```

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Migración.** Escribir y ejecutar `supabase/migrations/0007_historial.sql`: columna `cerrado_at` en `trips`; `finalizar_viaje` y `cancelar_viaje` recreadas (`create or replace`) para setear `cerrado_at = now()` al cerrar; y la RPC `historial_viajes()`. *Verificación:* la columna existe; finalizar un viaje deja `cerrado_at` con la hora del servidor; cancelar también; bajarse **no** lo setea (vuelve a `pendiente` con `cerrado_at` null); `select * from historial_viajes()` como pasajero y como conductor devuelve las filas correctas con `contraparte`.

2. **Tipos.** Extender `Trip` con `cerrado_at` y agregar `ViajeHistorial` en `lib/supabase/types.ts`. *Verificación:* `npm run lint` pasa.

3. **Helper de formato de fecha.** En `lib/formato.ts` (o donde ya viva el formateo), una función `fechaCorta(iso: string): string` en español. *Verificación:* devuelve algo como "22 jul 2026, 14:30".

4. **Ruta `/viajes`.** `app/viajes/page.tsx` como Server Component: exige sesión (`redirect("/login")` si no hay), resuelve el rol vía `getPerfil` (para el título y el enlace de vuelta), y llama a la RPC `historial_viajes()` — que ya resuelve rol, filtro, orden, límite y contraparte del lado del servidor. Renderiza la lista de filas o el estado vacío. Header con título "Mis viajes" y enlace de vuelta a `/viajar` o `/conducir` según rol. *Verificación:* como pasajero, `/viajes` lista sus finalizados/cancelados con el nombre del conductor; como conductor, los que manejó con el nombre del pasajero; ninguno ve los del otro.

5. **Componente de fila.** `app/viajes/fila-viaje.tsx` (o inline): origen → destino, distancia en km, tarifa en $, fecha (`fechaCorta`), **contraparte** (nombre, con fallback "Sin conductor"/"Sin pasajero") y badge de estado (Finalizado en verde, Cancelado en gris/rojo). *Verificación:* cada fila muestra los siete datos y el badge correcto.

6. **Navegación.** Agregar el enlace "Mis viajes" al header de `app/viajar/page.tsx` y `app/conducir/page.tsx` (junto a "Mi perfil"). *Verificación:* desde ambas vistas se llega a `/viajes` y se vuelve.

7. **Prueba end-to-end.** Con dos sesiones: completar un viaje entero (solicitar → aceptar → iniciar → finalizar) y verificar que aparece en el historial de **ambos** con estado Finalizado, la fecha de cierre y el nombre de la contraparte correcto (el pasajero ve al conductor, el conductor ve al pasajero). Cancelar otro viaje (antes y después de aceptar) y verificar que aparece como Cancelado; el cancelado sin conductor muestra el fallback de contraparte. *Verificación:* estados, fechas, contraparte, orden (más reciente primero) y aislamiento por rol correctos.

## Criterios de aceptación

- [ ] Existe la columna `trips.cerrado_at` en Supabase.
- [ ] Al **finalizar** un viaje, `cerrado_at` queda con la hora del servidor; al **cancelar**, también; al **bajarse** (vuelve a `pendiente`), `cerrado_at` sigue en null.
- [ ] `/viajes` existe y requiere sesión (sin sesión, redirige a `/login`).
- [ ] Como **pasajero**, `/viajes` muestra sus viajes `finalizada` y `cancelada`, del más reciente al más viejo, con origen, destino, distancia, tarifa, fecha, **nombre del conductor** y badge de estado.
- [ ] Como **conductor**, `/viajes` muestra los viajes que tuvo asignados y ya cerraron (`finalizada`/`cancelada`), con el mismo detalle y el **nombre del pasajero**.
- [ ] Un viaje cancelado sin conductor asignado muestra el fallback de contraparte ("Sin conductor") en vez de un nombre vacío.
- [ ] Un usuario **no** ve en su historial viajes de otro, ni datos de la contraparte más allá del **nombre** (la RPC `historial_viajes()` es `security definer` y se acota con `auth.uid()`; devuelve sólo el nombre, no teléfono ni vehículo).
- [ ] Los viajes **activos** (`pendiente`/`aceptada`/`en_curso`) **no** aparecen en el historial.
- [ ] Con historial vacío, `/viajes` muestra un estado vacío claro en vez de una lista rota.
- [ ] Hay un enlace "Mis viajes" en `/viajar` y en `/conducir`, y un enlace de vuelta desde `/viajes`.
- [ ] El historial no hace polling ni suscripciones: es una lectura estática al cargar la página.
- [ ] El historial trae a lo sumo 50 filas, las más recientes (límite fijado en la RPC).
- [ ] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** una sola ruta `/viajes` compartida, resuelta por la RPC `historial_viajes()` que ramifica por rol del lado del servidor. **No:** dos rutas separadas (`/viajar/historial` y `/conducir/historial`). El contenido y el layout son idénticos; sólo cambia quién es la contraparte, y eso lo decide la función. Una ruta evita duplicar la vista.
- **Sí:** agregar `cerrado_at` y setearlo en las RPC de cierre. **No:** ordenar/fechar sólo por `created_at`. `created_at` es la hora de la **solicitud**, no del cierre; para un historial "cuándo hiciste el viaje" el cierre es la fecha correcta. El costo es una columna y dos updates que ya tocábamos.
- **Sí:** `coalesce(cerrado_at, created_at)` para ordenar/fechar. **No:** exigir backfill de los viajes viejos. Los viajes cerrados antes de la migración no tienen `cerrado_at`; el `coalesce` los fecha por su `created_at` sin necesidad de migrar datos.
- **Sí:** una RPC `historial_viajes()` `security definer` que trae los viajes cerrados **con el nombre de la contraparte** en un solo round-trip. **No:** un `select` directo sobre `trips` por rol. Como el pasajero necesita el nombre del conductor (y viceversa) y la RLS de `profiles` no deja leer el perfil del otro rol, el join a `profiles` tiene que vivir en una función `security definer`; hacerlo con una RPC por fila (`datos_conductor` × N) sería N round-trips. La función valida `auth.uid()` en su `where`, así el aislamiento por usuario se mantiene sin policies nuevas.
- **Sí:** exponer **sólo el nombre** de la contraparte. **No:** teléfono, vehículo o enlace a su perfil. Es lo mínimo para reconocer con quién fue el viaje; el resto es más superficie de datos personales sin necesidad para el historial (y queda fuera de alcance).
- **Sí:** incluir los **cancelados** en el historial, con badge distinto. **No:** listar sólo finalizados. Un viaje cancelado es parte del historial del usuario (sobre todo del pasajero); ocultarlo daría un historial incompleto.
- **Sí:** mostrar la `tarifa_estimada` como "la tarifa del viaje". **No:** inventar un monto "cobrado". El cobro real es un spec aparte; acá la única cifra que existe es la estimación del Spec 04.
- **Sí:** lectura estática (Server Component, sin polling). **No:** refrescar el historial en vivo. Es data del pasado: no cambia sola. Se recalcula al navegar a la página (o con `revalidatePath` si hiciera falta).
- **Sí:** límite fijo de 50 sin paginación. **No:** scroll infinito ahora. Para el volumen de un MVP alcanza; la paginación es un incremento fácil de agregar después si el historial crece.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Viajes cerrados **antes** de esta migración quedan con `cerrado_at` null y podrían fecharse/ordenarse mal. | El `coalesce(cerrado_at, created_at)` los fecha por su hora de solicitud; siguen apareciendo, sólo con una fecha aproximada. Sin backfill. |
| Un viaje `cancelada` que llegó a tener conductor asignado aparece en el historial del conductor como algo que "no manejó". | Es correcto mostrarlo con badge **Cancelado**: refleja que ese viaje existió y se canceló. El badge distingue finalizado de cancelado, así no se confunde con un viaje cobrable. |
| El historial crece sin límite y la consulta se vuelve pesada. | `limit 50` en la RPC + los índices `(pasajero_id, estado)` y `(conductor_id, estado)` ya existentes acotan la consulta. La paginación real queda para otro spec. |
| `historial_viajes()` es `security definer` y cruza a `profiles`: un bug en su `where` podría exponer viajes o nombres de terceros. | La función filtra `where (pasajero_id = auth.uid() or conductor_id = auth.uid())`, así sólo devuelve viajes del propio usuario; y proyecta **sólo** `contraparte = nombre` (nunca teléfono, id ni otros campos de `profiles`). Se verifica en el paso end-to-end que un usuario no obtiene viajes ni nombres ajenos. |
| Recrear `finalizar_viaje`/`cancelar_viaje` podría pisar los cambios que el Spec 06 les metió (limpieza de `ubic_*`). | La migración `0007` parte del cuerpo **actual** de esas funciones (con la limpieza de `ubic_*` del Spec 06) y le suma `cerrado_at`; se verifica que finalizar/cancelar sigan limpiando `ubic_*` **y** seteando `cerrado_at`. |
| Confundir la tarifa estimada con un monto cobrado. | Copy explícito: la cifra es la tarifa **estimada** del viaje; no hay pago real en este spec (fuera de alcance). |

## Notas de implementación

Ajustes y confirmaciones hechos durante la implementación:

- **Migración manual.** El proyecto no tiene CLI de Supabase vinculado ni connection string (sólo la publishable key en `.env.local`, que no corre DDL). La migración `0007_historial.sql` se aplica a mano desde el SQL Editor del dashboard; los archivos en `supabase/migrations/` son la fuente de verdad versionada.
- **El límite vive en la RPC.** Los 50 viajes se acotan dentro de `historial_viajes()` (verdad del servidor); no se agregó constante en TS, en línea con cómo el Spec 06 dejó la frescura del lado servidor.
- **Degradación sin migración.** `app/viajes/page.tsx` sólo lee `data` de la RPC; si la función aún no existe, la página no crashea y muestra el estado vacío. Esto permitió terminar y buildear todo el frontend antes de correr la migración.
- **Helper de fecha.** Se agregó `lib/formato.ts` con `fechaCorta` (`Intl.DateTimeFormat` es-AR). Distancia y tarifa se siguen formateando inline como en el resto de la app (`toFixed(1)` km, `toLocaleString("es-AR")`), sin extraer helpers.
- **Viajes previos al spec.** Los viajes cerrados antes de la migración quedan con `cerrado_at` null y se fechan/ordenan por `created_at` vía `coalesce`, sin backfill. Verificado: aparecen en el historial de ambos roles.

## Lo que **no** entra en este spec

- Paginación / scroll infinito del historial.
- Filtros y búsqueda (fecha, estado, dirección).
- Datos de la contraparte más allá del nombre (teléfono, vehículo, foto, enlace al perfil).
- Detalle expandido por viaje (`/viajes/[id]`): mapa del recorrido, recibo.
- Exportar / descargar el historial.
- Totales y métricas agregadas (gastos/ingresos por período, cantidad de viajes).
- Pago/cobro real; la tarifa mostrada sigue siendo la estimación del Spec 04.

Cada uno de esos, si aterriza, va en su propio spec.
