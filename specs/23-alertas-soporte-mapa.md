# SPEC 23 — El rol soporte ve las alertas de emergencia

> **Estado:** aprobado
> **Depende de:** SPEC 12, SPEC 22
> **Fecha:** 2026-10-05
> **Objetivo:** Que el rol `soporte` (Spec 22) vea todas las alertas de emergencia disparadas desde cualquier viaje, cada una con el viaje asociado, quién la disparó, la hora y su ubicación marcada en un mapa.

El Spec 12 agregó el botón "Emergencia" en el viaje en curso del pasajero: llama al 911 y, en paralelo, registra una fila en `alertas_emergencia` con la ubicación GPS del momento (o sin ella, si el navegador no dio un fix). Pero ese spec dejó **explícitamente afuera** cualquier pantalla para verlas: "la tabla es sólo un registro de auditoría para este spec; un panel de alertas es un spec aparte". Este es ese spec.

El rol `soporte` ya existe desde el Spec 22, con su propio panel en `/soporte` (reclamos). Este spec le suma una segunda sección al mismo panel: `/soporte/alertas`.

## Alcance

**Incluye:**

- Una RPC `security definer` nueva en `supabase/migrations/0023_alertas_soporte.sql` — `alertas_soporte()` —, mismo patrón que `reclamos_soporte()` del Spec 22: devuelve todas las alertas de todos los usuarios (con quién la disparó y el origen/destino del viaje) si quien llama es `soporte`, vacío si no. No se toca ninguna policy de RLS existente de `alertas_emergencia`, `profiles` ni `trips`.
- **Tipo TypeScript** (`lib/supabase/types.ts`): `AlertaSoporte` (lo que devuelve la RPC).
- **Server Action** (`app/actions/seguridad.ts`, extendido): `getAlertasSoporte()`.
- **Pantalla `/soporte/alertas`** (`app/soporte/alertas/page.tsx` + `vista-alertas.tsx` + `mapa-alertas.tsx`, nuevos): un mapa con un marcador por cada alerta que tiene ubicación, y debajo la lista completa (con ubicación o sin ella) con viaje (origen → destino), quién la disparó, y hora. Tocar un marcador muestra esos mismos datos en un popup.
- Una pestaña simple **"Reclamos" / "Alertas"** arriba del contenido en `/soporte` y `/soporte/alertas`, para moverse entre las dos secciones del panel de soporte.
- Icono de alerta para el marcador del mapa (`ALERTA_SVG` en `components/iconos.tsx`, mismo trazo que `IconoAlerta`) y su estilo (`.marcador-alerta` en `app/globals.css`, mismo criterio visual que `.marcador-conductor` pero en rojo/`--color-peligro`, para distinguirse de inmediato de los marcadores de viaje).

**Fuera de alcance (para specs futuros):**

- Marcar una alerta como "atendida", archivarla o comentarla: a diferencia de los reclamos, el Spec 12 no definió ningún estado para una alerta; este spec sólo la muestra, no agrega un ciclo de vida que no fue pedido.
- Notificar a soporte en tiempo real cuando se dispara una alerta nueva (push, sonido, polling): `/soporte/alertas` se actualiza al entrar o recargar, no sola.
- Filtros (por fecha, por usuario) o paginación: todas las alertas, siempre.
- Llamar al pasajero, al conductor o al 911 desde esta pantalla.
- Mapa en vivo del conductor o del viaje en curso: la ubicación de la alerta es la foto fija del momento en que se disparó (igual que ya la guarda el Spec 12), no una posición que se actualiza sola.
- Cambiar en algo el botón "Emergencia" del lado del pasajero (`viaje-pendiente.tsx`) ni el registro que hace `registrarAlerta` — este spec sólo agrega la lectura del lado de soporte.

## Modelo de datos

Migración `supabase/migrations/0023_alertas_soporte.sql`. Idempotente, se aplica a mano desde el SQL Editor del dashboard. A diferencia de la 0022, no toca ningún enum: se puede pegar y ejecutar entera de una sola vez.

### RPC `alertas_soporte()`

```sql
create or replace function public.alertas_soporte()
returns table (
  id             uuid,
  trip_id        uuid,
  usuario_id     uuid,
  nombre_usuario text,
  email          text,
  origen_label   text,
  destino_label  text,
  ubic_lat       double precision,
  ubic_lng       double precision,
  created_at     timestamptz
)
language sql
security definer set search_path = public
as $$
  select a.id, a.trip_id, a.usuario_id, p.nombre, u.email,
         t.origen_label, t.destino_label, a.ubic_lat, a.ubic_lng, a.created_at
    from public.alertas_emergencia a
    join public.profiles p on p.id = a.usuario_id
    join auth.users      u on u.id = a.usuario_id
    join public.trips    t on t.id = a.trip_id
   where (select role from public.profiles where id = auth.uid()) = 'soporte'
   order by a.created_at desc;
$$;
```

Mismo estilo de lectura que `reclamos_soporte()`/`empresa_invitaciones()`/`mis_invitaciones()`: el filtro de rol va en el `where`, devuelve vacío en vez de lanzar excepción. `trip_id` en `alertas_emergencia` es `not null` (Spec 12), así que el `join` a `trips` —a diferencia del `left join` de `reclamos_soporte()`— siempre encuentra una fila.

### Tipo TypeScript (`lib/supabase/types.ts`, extendido)

```ts
// Una alerta tal como la devuelve la RPC alertas_soporte() (Spec 23): con
// quién la disparó y el viaje asociado. Sólo la puede pedir una cuenta con
// role = 'soporte'.
export type AlertaSoporte = {
  id: string;
  trip_id: string;
  usuario_id: string;
  nombre_usuario: string | null;
  email: string;
  origen_label: string;
  destino_label: string;
  ubic_lat: number | null;
  ubic_lng: number | null;
  created_at: string;
};
```

### Server Action (`app/actions/seguridad.ts`, extendido)

```ts
export async function getAlertasSoporte(): Promise<AlertaSoporte[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("alertas_soporte");
  return (data as AlertaSoporte[] | null) ?? [];
}
```

### Mapa de alertas

`app/soporte/alertas/mapa-alertas.tsx` (Client Component, cargado con `dynamic(..., { ssr: false })` desde `vista-alertas.tsx`, mismo patrón que `Mapa` en `app/viajar/mapa.tsx`): un `MapContainer` de react-leaflet con un `Marker` por cada alerta que tiene `ubic_lat`/`ubic_lng`, usando el ícono nuevo `iconoAlerta` (`divIcon` sobre `ALERTA_SVG`). Encuadra a todas las alertas con ubicación (`fitBounds`) o, si es una sola, centra ahí; si ninguna tiene ubicación, centra en `ROSARIO_CENTER` (`lib/geocode.ts`), igual que ya hacen `selector-viaje.tsx` y `panel-conductor.tsx` cuando no hay otro punto. Cada marcador abre un `Popup` con quién disparó la alerta, el viaje y la hora — los mismos tres datos que ya están en la fila de la lista, para no duplicar texto fuera del mapa.

Las alertas sin ubicación (`ubic_lat`/`ubic_lng` `null`, ver Spec 12) no tienen marcador: aparecen igual en la lista debajo del mapa, sin la parte de "ubicación en el mapa" porque no hay ninguna que mostrar.

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Commit 1 — este spec.** `specs/23-alertas-soporte-mapa.md`.

2. **Migración.** `supabase/migrations/0023_alertas_soporte.sql`: RPC `alertas_soporte()`. Aplicarla en Supabase (una sola ejecución, sin el problema de transacción de la 0022 porque no agrega ningún enum). *Verificación (SQL Editor):* `select * from alertas_soporte();` devuelve vacío con una cuenta que no es soporte y todas las alertas (de cualquier usuario, con nombre/email y origen/destino) con la cuenta de soporte creada en el Spec 22.

3. **Tipo + Server Action.** `lib/supabase/types.ts` (+`AlertaSoporte`); `app/actions/seguridad.ts` (+`getAlertasSoporte`). *Verificación:* `npm run build` compila.

4. **Ícono y estilo del marcador.** `ALERTA_SVG` en `components/iconos.tsx`; `.marcador-alerta` en `app/globals.css` (mismo patrón que `.marcador-conductor`, en `--color-peligro`). *Verificación:* visual, al llegar al paso 5.

5. **Pantalla `/soporte/alertas` y pestañas.** `app/soporte/alertas/page.tsx` (Server Component: guarda de rol igual que `/soporte`, llama a `getAlertasSoporte()`) + `vista-alertas.tsx` (Client Component: carga `mapa-alertas.tsx` con `dynamic(ssr:false)`, lista debajo) + `mapa-alertas.tsx`. Pestaña "Reclamos" / "Alertas" agregada en `/soporte/page.tsx` y en `/soporte/alertas/page.tsx`. *Verificación:* `npm run lint` pasa; ver Caso de prueba.

6. **Prueba end-to-end.** Ver "Caso de prueba". *Verificación:* todos los criterios de aceptación, más `npm run build` y `npm run lint`.

## Caso de prueba

Precondición: `npm run dev` en `http://localhost:3000`, migración 0023 aplicada, la cuenta de soporte (S) del Spec 22, y una cuenta pasajero (P) con un viaje aceptado o en curso.

| # | Paso | Resultado esperado |
| --- | --- | --- |
| 1 | Como P, en el viaje en curso (P07), tocar "Emergencia" con la geolocalización del navegador permitida. | Se abre el marcador de `tel:911` y, en paralelo, queda registrada la alerta (comportamiento sin cambios del Spec 12). |
| 2 | Loguearse como S y abrir `/soporte`, tocar la pestaña "Alertas". | Va a `/soporte/alertas`. Aparece un mapa con un marcador rojo en la posición de la alerta del paso 1. |
| 3 | Tocar ese marcador. | Se abre un popup con el nombre (o email) de P, el origen → destino del viaje, y la hora. |
| 4 | Debajo del mapa, ver la lista. | La misma alerta aparece como fila, con los mismos tres datos. |
| 5 | Repetir el paso 1 pero negando el permiso de geolocalización del navegador. | La alerta se registra igual (sin ubicación, comportamiento del Spec 12); en `/soporte/alertas` aparece en la lista pero **sin** marcador nuevo en el mapa. |
| 6 | Como S, tocar la pestaña "Reclamos" desde `/soporte/alertas`. | Vuelve a `/soporte` con el panel de reclamos de siempre (Spec 22), sin cambios. |
| 7 | Loguearse como P (o cualquier cuenta que no sea soporte) y, por la URL, entrar a `/soporte/alertas`. | Redirige a la ruta de ese rol (igual que ya hace `/soporte` en el Spec 22). |
| 8 | En el SQL Editor, logueado como P, llamar a `select * from alertas_soporte();`. | Devuelve 0 filas (P no es soporte). |

## Criterios de aceptación

- [ ] `alertas_soporte()` devuelve todas las alertas de todos los usuarios (con quién la disparó y el viaje asociado) cuando quien llama es `soporte`, y una lista vacía si no lo es.
- [ ] `/soporte/alertas` muestra un mapa con un marcador por cada alerta que tiene ubicación; tocar un marcador muestra en un popup quién disparó la alerta, el viaje (origen → destino) y la hora.
- [ ] Debajo del mapa, una lista muestra **todas** las alertas (con ubicación o sin ella) con los mismos tres datos.
- [ ] Una alerta sin `ubic_lat`/`ubic_lng` aparece en la lista pero no tiene marcador en el mapa.
- [ ] `/soporte` y `/soporte/alertas` tienen una pestaña para moverse entre "Reclamos" y "Alertas".
- [ ] Entrar a `/soporte/alertas` con un rol que no es `soporte` redirige a la ruta de ese rol.
- [ ] Un usuario que no es `soporte` no puede leer alertas ajenas, ni por la pantalla ni llamando a la RPC directamente.
- [ ] El botón "Emergencia" del pasajero, `registrarAlerta` y el resto del Spec 12 no cambian.
- [ ] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** acceso a todas las alertas sólo por la RPC `security definer` `alertas_soporte()`. **No:** una policy de RLS nueva en `alertas_emergencia` ni en `profiles`. Mismo criterio que `reclamos_soporte()` del Spec 22: el acceso cruzado entre cuentas va por función, no ampliando qué puede ver cada policy existente.
- **Sí:** mapa con un marcador por alerta + lista completa debajo (con o sin ubicación). **No:** sólo el mapa, dejando afuera las alertas sin coordenadas. El Spec 12 decidió explícitamente que una alerta sin ubicación "es mejor que ninguna alerta"; ocultarla en el panel de soporte porque no tiene pin la volvería invisible para quien la tiene que ver.
- **Sí:** popup del marcador con los mismos tres datos que la fila de la lista (viaje, usuario, hora). **No:** datos distintos en el mapa y en la lista. El pedido es "ve las alertas con viaje, usuario, hora y ubicación en el mapa": la ubicación es dónde se ve, no un cuarto dato aparte de los otros tres.
- **Sí:** una pestaña simple (dos enlaces) entre `/soporte` y `/soporte/alertas`, cada una su propia ruta. **No:** una sola pantalla con todo junto, ni un layout compartido (`layout.tsx`) para las dos. Son dos listados independientes (reclamos vs. alertas) que no comparten datos ni estado; dos rutas simples alcanzan, como ya hace `/empresa` con su selector de período dentro de una sola pantalla pero sin necesitar un layout propio.
- **No:** estado ni ciclo de vida para la alerta (atendida/archivada). El Spec 12 no lo definió y el pedido de este spec es "ver", no "gestionar"; inventar un estado es una decisión de producto no pedida, igual que con el motivo de los reclamos en el Spec 13.
- **No:** actualización en vivo (polling, websockets) de `/soporte/alertas`. No se pidió tiempo real; recargar la pantalla alcanza para un panel de soporte, igual que `/soporte` (reclamos) tampoco se actualiza sola.
- **Sí:** ícono y color de marcador propios para la alerta (rojo / `--color-peligro`), distinto de origen/destino/conductor. **No:** reusar `iconoConductor` o `iconoOrigen`. Una alerta de emergencia tiene que distinguirse de un pin de ruta a primera vista; el repo ya reserva el rojo (`--color-peligro`) para error/emergencia en el resto de la UI.
- **Sí:** centrar el mapa en `ROSARIO_CENTER` cuando ninguna alerta tiene ubicación. **No:** un mapa vacío sin centro ni mensaje. Mismo fallback que ya usan `selector-viaje.tsx` y `panel-conductor.tsx`.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Muchas alertas con la misma ubicación aproximada (por ejemplo, todas desde la misma zona) tapan sus marcadores entre sí. | Fuera de alcance de este spec (sin clustering): el popup y la lista debajo siguen distinguiendo cada alerta por su hora y usuario. Si el volumen lo justifica, un spec aparte agrega agrupado de marcadores. |
| `alertas_soporte()` no encuentra el viaje si `trips` llegara a permitir borrar filas referenciadas por `alertas_emergencia`. | No es el caso: `alertas_emergencia.trip_id` referencia `trips(id) on delete cascade` (Spec 12), así que la alerta se borra junto con el viaje; el `join` a `trips` nunca queda sin fila mientras la alerta exista. |
| El ícono `ALERTA_SVG` y el componente `IconoAlerta` se desincronizan si uno cambia de trazo sin el otro. | Mismo riesgo ya aceptado para `AUTO_SVG`/`IconoAuto` (Spec 04/06); es un string duplicado a propósito porque un `divIcon` de Leaflet necesita HTML crudo, no un componente React. |
| Cargar el mapa (Leaflet + tiles) en `/soporte/alertas` cuando no hay ninguna alerta con ubicación. | El `MapContainer` igual se muestra, centrado en `ROSARIO_CENTER`, sin marcadores; no es un estado roto, es un mapa vacío como el de `/viajar` antes de elegir destino. |

## Lo que **no** entra en este spec

- Estado o ciclo de vida de una alerta (atendida, archivada, comentada).
- Notificación en tiempo real a soporte cuando se dispara una alerta.
- Filtros o paginación en `/soporte/alertas`.
- Llamar al pasajero, al conductor o al 911 desde el panel de soporte.
- Posición en vivo del conductor o del viaje en curso dentro de este panel.
- Cambios al botón "Emergencia" o a `registrarAlerta` del lado del pasajero.
- Agrupado (clustering) de marcadores cercanos.

Cada uno de esos, si aterriza, va en su propio spec.
