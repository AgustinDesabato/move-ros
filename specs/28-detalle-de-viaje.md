# SPEC 28 — Detalle de un viaje

> **Estado:** implementado
> **Depende de:** SPEC 04, SPEC 07, SPEC 08, SPEC 10, SPEC 18
> **Fecha:** 2026-10-07
> **Objetivo:** Que el pasajero y el conductor abran `/viajes/[id]` desde el historial y vean un viaje cerrado completo: el mapa del recorrido, los montos según su rol y la calificación que dieron.

Hoy un viaje cerrado sólo existe como una fila del historial (`/viajes`, Spec 07): origen, destino, contraparte, distancia, tarifa y estado. No se ve en el mapa, el conductor no ve cuánto fue comisión y cuánto neto, y quien calificó sólo lee "Calificado", sin las estrellas ni el comentario que dejó.

Este spec agrega una página por viaje. No cambia el historial salvo por un enlace, y no agrega tablas: todos los datos ya están en `trips`, `pagos` y `calificaciones`.

El mapa muestra la **ruta por calles entre el origen y el destino**, recalculada con OSRM como en "Confirmar viaje". La app no guarda el trayecto real que hizo el conductor.

## Alcance

**Incluye:**

- **RPC `detalle_viaje(p_trip_id)`** en `supabase/migrations/0028_detalle_viaje.sql` (idempotente): devuelve una fila con el viaje, el nombre de la contraparte, el pago y la calificación propia, sólo si quien llama es el pasajero o el conductor de ese viaje.
- **Tipo TypeScript** `ViajeDetalle` en `lib/supabase/types.ts`.
- **Página `/viajes/[id]`** (`app/viajes/[id]/page.tsx`, Server Component, nuevo):
  - Llama a la RPC. Sin fila (viaje inexistente, ajeno o `id` mal formado) responde "no encontrado" (`notFound()`).
  - Si el viaje no está cerrado (`pendiente`, `aceptada` o `en_curso`), redirige a `/viajar` (pasajero) o `/conducir` (conductor).
  - Muestra, en este orden: fecha y estado, mapa, recorrido (origen → destino), distancia y duración, contraparte, montos y calificación.
- **Mapa del recorrido** (`app/viajes/[id]/mapa-recorrido.tsx`, Client Component, nuevo): reutiliza `Mapa` de `app/viajar/mapa.tsx` con los marcadores de origen y destino, y pide la polilínea con `obtenerRuta` (`lib/ruteo.ts`). Si OSRM no responde, quedan los dos marcadores y el aviso "No pudimos dibujar la ruta.".
- **Montos según el rol**, para un viaje finalizado:
  - Pasajero: total, medio de pago y estado del pago ("Pagado" o "Pendiente").
  - Conductor: lo mismo, más la comisión de la plataforma y el neto. Si el pago lo cobra su remisería, el neto lleva la aclaración "Lo cobra tu remisería".
  - Viaje finalizado sin fila en `pagos` (anterior al Spec 10): total con la tarifa estimada y el texto "Sin registro de pago".
- **Viaje cancelado:** se muestra la tarifa estimada con el texto "Viaje cancelado: no se cobró.". No hay sección de calificación.
- **Calificación** (`app/viajes/[id]/calificacion-detalle.tsx`, Client Component, nuevo), sólo en viajes finalizados:
  - Si el usuario ya calificó: sus estrellas y su comentario (si dejó).
  - Si no calificó: botón "Calificar a {contraparte}" que abre el `FormCalificacion` de siempre (`app/viajes/form-calificacion.tsx`); al enviar, la página se refresca y muestra la calificación.
- **Enlace "Ver detalle"** en cada fila del historial (`app/viajes/fila-viaje.tsx`), que lleva a `/viajes/{id}`. La fila conserva todas sus acciones actuales.

**Fuera de alcance (para specs futuros):**

- Guardar y mostrar el trayecto real del conductor (traza GPS).
- Mostrar la calificación **recibida** en ese viaje, o su comentario: se sigue viendo sólo el promedio (Spec 08).
- Detalle de un viaje activo: para eso están `/viajar` y `/conducir`.
- Acceso de la remisería o de soporte al detalle.
- "Reportar un problema" y "Ver datos de transferencia" dentro del detalle: siguen en la fila del historial.
- Datos del vehículo, teléfono de la contraparte o cualquier forma de contactarla.
- Descargar o compartir un comprobante del viaje.
- Enlaces al detalle desde otras pantallas (reclamos, panel de la remisería, soporte).
- Cambiar la policy `pagos_select` (Spec 10).

## Modelo de datos

Sin tablas ni columnas nuevas. Una función nueva y un tipo nuevo.

### Migración `0028_detalle_viaje.sql`

Idempotente, se aplica a mano desde el SQL Editor del dashboard y se puede pegar entera en una sola ejecución.

```sql
-- SPEC 28 — Detalle de un viaje
-- Idempotente: segura de re-ejecutar (sólo create or replace function).

-- Un viaje con todo lo que muestra /viajes/[id]: el nombre de la contraparte,
-- el pago y la calificación que dio quien llama. Es security definer porque
-- cruza a profiles, que la RLS no deja leer del otro rol (mismo motivo que
-- historial_viajes). Se acota a los dos participantes con auth.uid() en el
-- where: sin sesión o para un viaje ajeno, devuelve vacío.
-- No filtra por estado: la página redirige si el viaje sigue activo.
create or replace function public.detalle_viaje(p_trip_id uuid)
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

Devuelve cero o una fila: `pagos.trip_id` es único (Spec 10) y `calificaciones` tiene `unique (trip_id, autor_id)` (Spec 08).

### Tipo TypeScript (`lib/supabase/types.ts`, extendido)

```ts
// Un viaje tal como lo devuelve la RPC detalle_viaje() (Spec 28): sólo para
// el pasajero o el conductor de ese viaje. Los campos pago_* son null si el
// viaje no tiene pago; pago_comision y pago_neto, además, si mira el pasajero.
// mi_estrellas es null si quien mira todavía no calificó.
export type ViajeDetalle = {
  id: string;
  estado: TripStatus;
  created_at: string;
  cerrado_at: string | null;
  origen_label: string;
  origen_lat: number;
  origen_lng: number;
  destino_label: string;
  destino_lat: number;
  destino_lng: number;
  distancia_m: number;
  duracion_s: number;
  tarifa_estimada: number;
  metodo_pago: MetodoPago;
  soy_conductor: boolean;
  contraparte: string | null;
  pago_estado: PagoEstado | null;
  pago_monto: number | null;
  pago_comision: number | null;
  pago_neto: number | null;
  pago_a_empresa: boolean;
  mi_estrellas: number | null;
  mi_comentario: string | null;
};
```

### Página

`app/viajes/[id]/page.tsx` lee `params` como promesa (`params: Promise<{ id: string }>`), que es la forma de esta versión de Next.js. Antes de escribirla se confirma contra `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md` y `not-found.md`.

| Situación | Resultado |
| --- | --- |
| Sin sesión | El middleware ya redirige a `/bienvenida`. |
| La RPC no devuelve fila | `notFound()` |
| `estado` es `pendiente`, `aceptada` o `en_curso` | `redirect("/conducir")` si `soy_conductor`, si no `redirect("/viajar")` |
| `estado` es `finalizada` o `cancelada` | Se muestra el detalle |

La fecha es `cerrado_at`, o `created_at` si falta, igual que en el historial. La duración es `duracion_s`, la estimada por OSRM al solicitar. Sin contraparte asignada se muestra "Sin conductor" o "Sin pasajero", como en la fila del historial.

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Commit 1 — este spec.** `specs/28-detalle-de-viaje.md`.

2. **Migración.** `supabase/migrations/0028_detalle_viaje.sql` y aplicarla en Supabase. *Verificación (SQL Editor):* corre dos veces sin error; `select * from detalle_viaje('<id de un viaje>')` sin sesión de usuario devuelve 0 filas.

3. **Tipo y página con los datos.** `ViajeDetalle` en `lib/supabase/types.ts`; `app/viajes/[id]/page.tsx` con la RPC, `notFound()`, la redirección de viajes activos y las secciones de fecha, estado, recorrido, distancia, duración, contraparte y montos. Todavía sin mapa ni calificación. *Verificación:* filas 2, 5, 6, 7, 9, 10 y 11 del caso de prueba.

4. **Mapa del recorrido.** `app/viajes/[id]/mapa-recorrido.tsx` y su uso en la página. *Verificación:* fila 3 del caso de prueba.

5. **Calificación.** `app/viajes/[id]/calificacion-detalle.tsx` y su uso en la página. *Verificación:* filas 4 y 8 del caso de prueba.

6. **Enlace desde el historial.** "Ver detalle" en `app/viajes/fila-viaje.tsx`. *Verificación:* fila 1 del caso de prueba.

7. **Prueba end-to-end.** Ver "Caso de prueba". *Verificación:* todos los criterios de aceptación, más `npm run build` y `npm run lint`.

## Caso de prueba

Precondición: `npm run dev` corriendo en `http://localhost:3000`, migración 0028 aplicada, un pasajero (P) y un conductor (C) con un viaje **finalizado** entre ellos que P todavía no calificó, y un viaje **cancelado** de P.

| # | Paso | Resultado esperado |
| --- | --- | --- |
| 1 | Como P, abrir `/viajes` y tocar "Ver detalle" en el viaje finalizado. | Va a `/viajes/{id}`. La fila del historial conserva "Calificar", "Reportar un problema" y, si pagó por transferencia, "Ver datos de transferencia". |
| 2 | Ver el encabezado y los datos. | Fecha, estado "Finalizado", origen → destino, distancia, duración y el nombre de C. |
| 3 | Ver el mapa. | Marcadores de origen y destino y la ruta por calles entre ambos, encuadrada. |
| 4 | Ver la sección de calificación. | Botón "Calificar a {C}". Al tocarlo aparece el formulario; al enviar 4 estrellas con un comentario, la sección pasa a mostrar las 4 estrellas y el comentario. |
| 5 | Ver los montos como P. | Total, medio de pago y estado del pago. **No** aparecen comisión ni neto. |
| 6 | Como C, abrir el mismo `/viajes/{id}`. | Mismo viaje con el nombre de P. Montos: total, medio de pago, estado, comisión y neto, con neto = total − comisión. |
| 7 | Como P, abrir el detalle del viaje cancelado. | Estado "Cancelado", mapa y recorrido, "Viaje cancelado: no se cobró." con la tarifa estimada. Sin sección de calificación. |
| 8 | Como C, abrir el detalle del viaje finalizado sin haber calificado. | Botón "Calificar a {P}" con los aspectos del pasajero. La calificación de P **no** se muestra. |
| 9 | Como otro pasajero (Q), abrir `/viajes/{id}` del viaje de P. | Página "no encontrado". |
| 10 | Como P, abrir `/viajes/no-es-un-id`. | Página "no encontrado". |
| 11 | Como P, con un viaje en curso, abrir `/viajes/{id}` de ese viaje. | Redirige a `/viajar`. |
| 12 | Cortar la red a OSRM (o apagar `/api/ruteo`) y abrir un detalle. | El mapa muestra origen y destino sin línea y el aviso "No pudimos dibujar la ruta."; el resto de la página se ve igual. |

## Criterios de aceptación

- [ ] `detalle_viaje(id)` devuelve una fila para el pasajero y para el conductor del viaje, y ninguna para cualquier otro usuario o sin sesión.
- [ ] La migración 0028 corre dos veces seguidas sin error.
- [ ] `/viajes/{id}` de un viaje cerrado propio muestra fecha, estado, origen, destino, distancia, duración y contraparte.
- [ ] El mapa muestra los marcadores de origen y destino y la ruta entre ambos; si la ruta no se puede calcular, muestra los marcadores y un aviso, sin romper la página.
- [ ] En un viaje finalizado, el pasajero ve total, medio de pago y estado del pago, y no ve comisión ni neto.
- [ ] En un viaje finalizado, el conductor ve además comisión y neto.
- [ ] En un viaje cancelado se muestra la tarifa estimada con "Viaje cancelado: no se cobró." y no hay sección de calificación.
- [ ] Quien ya calificó ve sus estrellas y su comentario; quien no, puede calificar desde el detalle y al enviar ve su calificación sin salir de la página.
- [ ] Nunca se muestra la calificación que dio la otra persona.
- [ ] Un viaje ajeno, inexistente o con un `id` mal formado responde "no encontrado".
- [ ] Un viaje propio todavía activo redirige a `/viajar` o `/conducir` según el rol.
- [ ] Cada fila de `/viajes` tiene un enlace "Ver detalle" a su página, y conserva sus acciones actuales.
- [ ] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** el detalle es para el pasajero y el conductor del viaje, y sólo para viajes cerrados. **No:** viajes en curso, ni acceso de la remisería. Decisión del usuario: mismo alcance que el historial; el viaje activo ya tiene sus pantallas.
- **Sí:** montos según el rol (el conductor ve comisión y neto; el pasajero no). **No:** lo mismo para los dos, ni el desglose completo para el pasajero. Decisión del usuario.
- **Sí:** mostrar la calificación que dio quien mira, y dejar calificar desde el detalle si falta. **No:** mostrar la calificación recibida. Decisión del usuario: hoy sólo se ve el promedio, y mostrar las estrellas de un viaje puntual revela quién puso qué.
- **Sí:** un enlace "Ver detalle" en cada fila del historial, que conserva sus acciones. **No:** mudar "calificar", "reportar" y "datos de transferencia" al detalle. Decisión del usuario: cambio mínimo en `/viajes`.
- **Sí:** el mapa dibuja la ruta entre origen y destino recalculada con OSRM. **No:** el trayecto real del conductor. La app no guarda la traza GPS; guardarla es otro spec.
- **Sí:** pedir la ruta desde el cliente con `obtenerRuta`, como "Confirmar viaje". **No:** calcularla en el servidor al renderizar la página. Si OSRM tarda o falla, el resto del detalle ya se ve.
- **Sí:** una RPC `security definer` que devuelve todo en una fila. **No:** tres consultas directas a `trips`, `pagos` y `calificaciones`. El nombre de la contraparte está en `profiles`, que la RLS no deja leer del otro rol; es el mismo motivo por el que existe `historial_viajes()`.
- **Sí:** la RPC devuelve `pago_comision` y `pago_neto` en `null` cuando mira el pasajero. **No:** devolverlos siempre y ocultarlos en la pantalla. Este spec no cambia la policy `pagos_select` del Spec 10, que hoy sí deja al pasajero leer la fila de `pagos` de su viaje consultando la tabla directamente.
- **Sí:** la RPC no filtra por estado y la página redirige los viajes activos. **No:** filtrar en la RPC. Así la página distingue "viaje propio todavía activo" (redirigir) de "viaje que no es tuyo" (no encontrado) con una sola consulta.
- **Sí:** `soy_conductor` sale de la RPC. **No:** deducirlo de `profile.role`. Lo que importa es el papel en ese viaje, y ahorra leer el perfil.
- **Sí:** `pago_a_empresa` para aclarar "Lo cobra tu remisería" junto al neto. **No:** mostrar el neto sin aclaración. Para un conductor de remisería, el destinatario del pago es la empresa (Spec 10); sin la aclaración parecería que lo cobra él.
- **Sí:** responder "no encontrado" tanto para un viaje inexistente como para uno ajeno. **No:** un mensaje de "sin permiso". No revela si un `id` existe.
- **Sí:** reutilizar `Mapa` de `app/viajar/mapa.tsx` y `FormCalificacion` de `app/viajes/form-calificacion.tsx`. **No:** componentes nuevos. Ya cubren el motor vectorial con respaldo (Spec 18) y la calificación (Spec 08).
- **Sí:** en un viaje cancelado se muestra igual el mapa con la ruta planeada. **No:** ocultarlo. Origen y destino están guardados y sirven para reconocer el viaje.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La ruta recalculada hoy difiere de la que se calculó al solicitar (OSRM cambia, o hay calles nuevas), y la distancia del mapa no coincide con la guardada. | El detalle muestra la distancia y la duración **guardadas** en `trips`; de `obtenerRuta` sólo se usa la polilínea. |
| El usuario cree que la línea del mapa es por donde fue realmente el auto. | Aceptado para este spec. El trayecto real queda fuera de alcance y anotado como spec futuro. |
| `Mapa` está pensado para pantalla completa y sus márgenes por defecto son grandes para un recuadro chico. | `mapa-recorrido.tsx` le pasa un `margen` chico acorde al alto del recuadro. |
| Viajes finalizados antes del Spec 10 no tienen fila en `pagos`. | Caso contemplado: total con la tarifa estimada y "Sin registro de pago". |
| Un `id` que no es un UUID hace fallar la llamada a la RPC. | La página trata "error o sin fila" como "no encontrado". |
| El pasajero puede seguir leyendo comisión y neto consultando `pagos` directamente. | Preexistente (policy del Spec 10) y fuera de alcance; la pantalla y la RPC nueva no los exponen. |

## Lo que **no** entra en este spec

- Trayecto real del conductor.
- Calificación recibida o su comentario.
- Detalle de un viaje activo.
- Acceso de la remisería o de soporte.
- "Reportar un problema" y "Ver datos de transferencia" dentro del detalle.
- Datos de contacto o del vehículo de la contraparte.
- Comprobante descargable.
- Cambios a la policy `pagos_select`.

Cada uno de esos, si aterriza, va en su propio spec.
