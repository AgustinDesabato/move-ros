# SPEC 20 — Restricciones del vehículo en la base

> **Estado:** implementado
> **Depende de:** SPEC 02, SPEC 19
> **Fecha:** 2026-10-04
> **Objetivo:** Que la tabla `vehicles` garantice por sí sola patente argentina única, color de la lista y capacidad de 1 a 6, con `CHECK` validados sobre todas las filas y el error de patente repetida debajo de su campo en `/perfil/editar`.

El Spec 19 dejó las reglas del vehículo en `lib/validacion.ts` y puso `CHECK ... NOT VALID` sólo para el formato de la patente y el largo de los textos. Quedaron tres huecos:

- **La patente no es única.** Dos conductores pueden cargar el mismo auto, y es el dato con el que el pasajero reconoce el vehículo. El Spec 19 lo dejó fuera de alcance.
- **El color sólo se controla en la app.** El Spec 19 decidió no poner `CHECK` para no duplicar la lista; este spec revierte esa decisión para el color (no para la marca).
- **Los `CHECK` son `NOT VALID`.** Filas viejas inválidas siguen ahí hasta que el conductor guarde su perfil.

Además, la capacidad baja de 1–10 a **1–6**.

El formato de la patente (`ABC123` / `AB123CD`) ya está resuelto por el Spec 19 (`validarPatente` y `vehicles_patente_formato`); acá sólo se valida contra las filas existentes.

## Alcance

**Incluye:**

- Migración `supabase/migrations/0020_restricciones_vehiculo.sql` (idempotente):
  - Verifica primero los datos existentes (ver abajo) y recién después normaliza `vehicles.color` cuando coincide con un valor de la lista sin importar mayúsculas, tildes ni espacios al borde (`'bordo'` → `'Bordó'`).
  - Verifica los datos existentes y **aborta** con un mensaje que lista las filas problemáticas si encuentra: patentes duplicadas, patentes con formato inválido, colores fuera de la lista, capacidades fuera de 1–6 o marca/modelo/color fuera de 2–30 caracteres. No corrige ni borra nada de eso: se arregla a mano y se re-ejecuta.
  - `UNIQUE (patente)` en `vehicles` (`vehicles_patente_unica`).
  - `CHECK` de color con la lista literal (`vehicles_color_lista`).
  - Reemplaza el `CHECK` de capacidad de la 0002 (`vehicles_capacidad_check`, 1–10) por `vehicles_capacidad_rango` (1–6).
  - `VALIDATE CONSTRAINT` de `vehicles_patente_formato` y `vehicles_textos_largo` (del Spec 19).
- `lib/validacion.ts`: `validarCapacidad` pasa a 1–6, con su mensaje.
- `app/perfil/perfil-form.tsx`: el input de capacidad pasa a `max={6}`.
- `app/actions/perfil.ts` (`guardarPerfil`):
  - Hace el `upsert` de `vehicles` **antes** del `update` de `profiles`, para que una patente repetida no deje el perfil guardado a medias.
  - Si el `upsert` falla con código `23505` sobre `vehicles_patente_unica`, devuelve `errores.patente = "Esa patente ya está registrada en otra cuenta."` y los `valores`, en vez del error general.

**Fuera de alcance (para specs futuros):**

- `CHECK` de marca con la lista `MARCAS` (sigue sólo en la app).
- Chequear disponibilidad de la patente al salir del campo (`onBlur`): requeriría una RPC que permitiría enumerar patentes ajenas.
- Guardar perfil y vehículo en una sola transacción (RPC).
- Unicidad del teléfono entre cuentas.
- Tabla de colores editable sin migración.
- Patentes de moto u otros formatos especiales.
- Reclamo o disputa cuando alguien registró la patente de otro.
- Usar la capacidad para filtrar el despacho de viajes.

## Modelo de datos

No hay columnas ni tablas nuevas: `lib/supabase/types.ts` no cambia. Cambian las restricciones de `public.vehicles`:

| Restricción | Antes | Después |
| --- | --- | --- |
| `vehicles_patente_unica` | — | `UNIQUE (patente)` |
| `vehicles_color_lista` | — | `CHECK (color IN (...COLORES))` |
| `vehicles_capacidad_check` (0002) | `capacidad between 1 and 10` | se elimina |
| `vehicles_capacidad_rango` | — | `CHECK (capacidad between 1 and 6)` |
| `vehicles_patente_formato` (0019) | `NOT VALID` | validado |
| `vehicles_textos_largo` (0019) | `NOT VALID` | validado |

### `lib/validacion.ts`

```ts
export const CAPACIDAD_MAX = 6;

export function validarCapacidad(crudo: string): { ok: true; valor: number } | { ok: false; error: string };
// "La capacidad debe ser un número entero entre 1 y 6."
```

`COLORES` no cambia y tiene que coincidir **exactamente** con la lista del `CHECK` (mismas mayúsculas y tildes). El comentario sobre `COLORES` lo aclara y apunta a la migración 0020.

### Migración `0020_restricciones_vehiculo.sql`

```sql
-- SPEC 20 — Restricciones del vehículo
-- Idempotente: seguro de re-ejecutar. Aborta sin crear restricciones si hay
-- datos que no cumplen y no se pueden corregir solos.
--
-- Antes de aplicar, confirmar el nombre del CHECK de capacidad de la 0002:
--   select conname from pg_constraint where conrelid = 'public.vehicles'::regclass;
-- Si no es vehicles_capacidad_check, ajustar el drop del paso 3.

-- 1. Verificar lo que no se puede corregir solo. Junta todos los problemas
--    y aborta con la lista completa. Va antes de cualquier update: los CHECK
--    NOT VALID del Spec 19 rigen para toda fila que se actualice, así que
--    normalizar el color de una fila con patente inválida fallaría.
--    El color se compara ignorando mayúsculas, tildes y espacios al borde,
--    porque esas diferencias se corrigen en el paso 2.
do $$
declare
  problemas text;
begin
  select string_agg(p, E'\n') into problemas from (
    select 'patente duplicada ' || patente || ': ' || string_agg(conductor_id::text, ', ') as p
      from public.vehicles group by patente having count(*) > 1
    union all
    select 'patente inválida ' || patente || ' (' || conductor_id || ')'
      from public.vehicles
     where patente !~ '^([A-Z]{3}[0-9]{3}|[A-Z]{2}[0-9]{3}[A-Z]{2})$'
    union all
    select 'color fuera de la lista "' || color || '" (' || conductor_id || ')'
      from public.vehicles
     where translate(lower(btrim(color)), 'áéíóúü', 'aeiouu') not in
           ('blanco','negro','gris','plata','rojo','bordo','azul','celeste',
            'verde','amarillo','naranja','marron','beige','dorado','violeta')
    union all
    select 'capacidad ' || capacidad || ' fuera de 1–6 (' || conductor_id || ')'
      from public.vehicles where capacidad not between 1 and 6
    union all
    select 'marca/modelo/color fuera de 2–30 caracteres (' || conductor_id || ')'
      from public.vehicles
     where not (char_length(btrim(marca))  between 2 and 30 and
                char_length(btrim(modelo)) between 2 and 30 and
                char_length(btrim(color))  between 2 and 30)
  ) t;

  if problemas is not null then
    raise exception E'SPEC 20: corregí estos vehículos y volvé a correr la migración:\n%', problemas;
  end if;
end;
$$;

-- 2. Color: llevar a la forma canónica de la lista lo que coincide
--    ignorando mayúsculas, tildes y espacios al borde.
--    La lista tiene que coincidir con COLORES en lib/validacion.ts.
with lista(color) as (
  values ('Blanco'), ('Negro'), ('Gris'), ('Plata'), ('Rojo'), ('Bordó'),
         ('Azul'), ('Celeste'), ('Verde'), ('Amarillo'), ('Naranja'),
         ('Marrón'), ('Beige'), ('Dorado'), ('Violeta')
)
update public.vehicles v
   set color = l.color
  from lista l
 where translate(lower(btrim(v.color)), 'áéíóúü', 'aeiouu')
     = translate(lower(l.color), 'áéíóúü', 'aeiouu')
   and v.color <> l.color;

-- 3. Restricciones nuevas.
alter table public.vehicles drop constraint if exists vehicles_patente_unica;
alter table public.vehicles add constraint vehicles_patente_unica unique (patente);

alter table public.vehicles drop constraint if exists vehicles_color_lista;
alter table public.vehicles add constraint vehicles_color_lista
  check (color in ('Blanco','Negro','Gris','Plata','Rojo','Bordó','Azul','Celeste',
                   'Verde','Amarillo','Naranja','Marrón','Beige','Dorado','Violeta'));

alter table public.vehicles drop constraint if exists vehicles_capacidad_check;
alter table public.vehicles drop constraint if exists vehicles_capacidad_rango;
alter table public.vehicles add constraint vehicles_capacidad_rango
  check (capacidad between 1 and 6);

-- 4. Validar los CHECK del Spec 19 sobre las filas viejas.
alter table public.vehicles validate constraint vehicles_patente_formato;
alter table public.vehicles validate constraint vehicles_textos_largo;
```

El paso 1 (verificación) corre antes de cualquier `update`: los `CHECK ... NOT VALID` del Spec 19 rigen para toda fila que se actualice, así que normalizar el color de una fila con patente inválida fallaría con `vehicles_patente_formato` antes de llegar a la lista de problemas. Si aborta, la tabla queda como estaba. Postgres corre cada archivo de migración en una transacción en el SQL Editor de Supabase.

`vehicles_capacidad_check` es el nombre que Postgres le dio al `check` inline de la 0002. Antes de aplicar, se confirma con `select conname from pg_constraint where conrelid = 'public.vehicles'::regclass;`. Si el nombre es otro, se ajusta la línea del `drop`.

### `guardarPerfil`

```ts
if (vehiculo) {
  const { error: errVehiculo } = await supabase.from("vehicles").upsert({ ... });
  if (errVehiculo) {
    if (errVehiculo.code === "23505" && errVehiculo.message.includes("vehicles_patente_unica")) {
      return { errores: { patente: "Esa patente ya está registrada en otra cuenta." }, valores };
    }
    console.error(...);
    return { error: "No se pudo guardar el vehículo. Intentá de nuevo.", valores };
  }
}
// recién después: update de profiles
```

El `upsert` resuelve el conflicto por `conductor_id` (PK), así que un `23505` sólo puede venir de la patente. Igual se chequea el nombre de la restricción para no confundirlo con otro índice futuro.

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Commit 1 — este spec.** `specs/20-restricciones-vehiculo.md`.

2. **Migración.** `supabase/migrations/0020_restricciones_vehiculo.sql`; confirmar el nombre del `CHECK` de capacidad viejo y aplicarla en Supabase. *Verificación:* corre dos veces sin error; las seis restricciones de la tabla de "Modelo de datos" aparecen en `pg_constraint` con `convalidated = true`; un `insert` con patente repetida, color `'Fucsia'` o capacidad `7` falla con la restricción correspondiente.

3. **Capacidad 1–6 en la app.** `validarCapacidad` y `CAPACIDAD_MAX` en `lib/validacion.ts`; `max={CAPACIDAD_MAX}` en `app/perfil/perfil-form.tsx`; comentario en `COLORES` apuntando a la 0020. *Verificación:* filas 4 y 5 del caso de prueba.

4. **Patente repetida en `guardarPerfil`.** Reordenar a vehículo primero y traducir el `23505`. *Verificación:* filas 1–3 del caso de prueba.

5. **Prueba end-to-end.** Ver "Caso de prueba". *Verificación:* todos los criterios de aceptación, más `npm run build` y `npm run lint`.

## Caso de prueba

Precondición: `npm run dev` corriendo en `http://localhost:3000`, migración 0020 aplicada y dos cuentas de conductor, A y B. A ya tiene el vehículo con patente `AB123CD`.

| # | Paso | Resultado esperado |
| --- | --- | --- |
| 1 | Como B, en `/perfil/editar`, cambiar el nombre a `Pedro Gómez`, poner patente `ab 123 cd` y guardar. | Error "Esa patente ya está registrada en otra cuenta." debajo de "Patente". Los valores escritos se conservan. En `profiles`, el nombre de B **no** cambió. |
| 2 | Como B, cambiar la patente a `AC456DE` y guardar. | Se guarda y redirige. `vehicles.patente = 'AC456DE'` y el nombre de B es `Pedro Gómez`. |
| 3 | Como A, abrir `/perfil/editar` y guardar sin cambios. | Se guarda: la patente propia no choca consigo misma. |
| 4 | Como B, poner capacidad `7` y salir del campo. | Error "La capacidad debe ser un número entero entre 1 y 6." debajo de "Capacidad", sin enviar. Al enviar, el mismo error desde el servidor. |
| 5 | Como B, poner capacidad `6` y guardar. | Se guarda. |
| 6 | En el SQL Editor, `update vehicles set color = 'Fucsia' where conductor_id = '<B>'`. | Falla por `vehicles_color_lista`. |
| 7 | En el SQL Editor, `update vehicles set patente = 'AB123CD' where conductor_id = '<B>'`. | Falla por `vehicles_patente_unica`. |
| 8 | En el SQL Editor, `update vehicles set capacidad = 8 where conductor_id = '<B>'`. | Falla por `vehicles_capacidad_rango`. |
| 9 | En una base de prueba, cargar dos vehículos con la misma patente y uno con color `'Fucsia'`, y correr la 0020. | La migración aborta con un mensaje que lista la patente duplicada (con ambos `conductor_id`) y el color inválido. No se crea ninguna restricción nueva. |
| 10 | En una base de prueba, cargar un vehículo con color `'bordo'` y correr la 0020. | Se guarda como `'Bordó'` y la migración termina sin error. |

## Criterios de aceptación

- [ ] `vehicles` tiene `vehicles_patente_unica`, `vehicles_color_lista`, `vehicles_capacidad_rango`, `vehicles_patente_formato` y `vehicles_textos_largo`, todas con `convalidated = true`, y ya no tiene `vehicles_capacidad_check`.
- [ ] La migración 0020 corre dos veces seguidas sin error sobre datos válidos.
- [ ] Con datos inválidos que no se pueden normalizar, la migración aborta listando todas las filas problemáticas y no crea ninguna restricción nueva.
- [ ] La migración no borra filas ni pone valores en NULL; sólo cambia `color` a su forma canónica cuando coincide con la lista.
- [ ] La lista del `CHECK` de color es idéntica a `COLORES` en `lib/validacion.ts`.
- [ ] Un conductor no puede guardar una patente que ya tiene otro conductor; el error aparece debajo de "Patente" con el texto "Esa patente ya está registrada en otra cuenta.".
- [ ] Si el vehículo falla al guardar, `profiles` no cambia.
- [ ] La capacidad se acepta sólo entre 1 y 6, en el cliente (`onBlur` y `max` del input), en el servidor y en la base, con el mismo mensaje en cliente y servidor.
- [ ] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** `CHECK` de color con la lista literal. **No:** tabla `colores` con FK, ni dejarlo sólo en la app como decidió el Spec 19. Pedido explícito de restricción en la base; la lista cambia poco y una migración por color nuevo es aceptable. Revierte parcialmente la decisión del Spec 19.
- **No:** `CHECK` de marca. La lista de marcas cambia más seguido; se mantiene la decisión del Spec 19.
- **Sí:** `UNIQUE (patente)` sobre todas las filas, con la migración abortando si hay duplicados. **No:** índice único parcial que excluya las filas viejas. Deja huecos y es más difícil de razonar; los duplicados se resuelven a mano.
- **Sí:** detectar la patente repetida capturando el `23505` del `upsert`. **No:** una RPC `security definer` para consultar disponibilidad. La RLS no deja ver vehículos ajenos y una RPC permitiría enumerar patentes.
- **No:** chequear la patente repetida en `onBlur`. Mismo motivo; sólo el servidor lo detecta al guardar.
- **Sí:** guardar el vehículo antes que el perfil. **No:** RPC transaccional. Es el cambio mínimo para que una patente repetida no deje el perfil a medias; el caso inverso (vehículo guardado, perfil falla) sólo pasa con la base caída.
- **Sí:** capacidad 1–6. **No:** mantener 1–10. Cubre autos y camionetas/minivans; más de 6 pasajeros no es un remís.
- **Sí:** `VALIDATE CONSTRAINT` de los `CHECK` del Spec 19. **No:** dejarlos `NOT VALID`. Cierra el hueco de filas viejas ahora que la migración verifica los datos antes.
- **Sí:** normalizar el color (mayúsculas, tildes) y abortar con lo demás. **No:** recortar capacidades a 6, inventar colores ni dejar el `CHECK` de color `NOT VALID`. Lo que tiene una única corrección obvia se corrige; el resto lo decide una persona.
- **Sí:** verificar antes de normalizar el color. **No:** normalizar primero. Se cambió durante la implementación: el `update` de color sobre una fila con patente inválida fallaba por el `CHECK NOT VALID` del Spec 19 sin mostrar la lista de problemas.
- **Sí:** un solo paso de verificación que junta todos los problemas. **No:** dejar que cada `VALIDATE` falle por separado. Así se arregla todo de una vez en vez de re-ejecutar la migración por cada error.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `COLORES` en TypeScript y la lista del `CHECK` se desincronizan (se agrega un color en un lado solo). | Comentario en `COLORES` que apunta a la 0020; criterio de aceptación de listas idénticas. Si se agrega un color sólo en la app, el guardado falla con el error general y se nota enseguida. |
| El `CHECK` de capacidad de la 0002 tiene otro nombre y el `drop ... if exists` no lo borra: quedan dos `CHECK` (1–10 y 1–6). | El paso 2 del plan confirma el nombre en `pg_constraint` antes de aplicar. Aunque quedara, el efectivo es el más estricto (1–6). |
| Alguien registra la patente de otro conductor y el dueño real no puede cargarla. | Fuera de alcance; el mensaje no revela de quién es la cuenta. Se resuelve a mano desde la base hasta que haya un flujo de reclamo. |
| La migración aborta en producción por datos viejos. | Es lo buscado: el mensaje lista cada fila con su `conductor_id`. Se corrige a mano y se re-ejecuta; no se pierde nada. |
| El mensaje de error del `23505` cambia de formato y el `includes("vehicles_patente_unica")` deja de coincidir. | En ese caso cae en el error general "No se pudo guardar el vehículo."; no se guarda nada inválido. |

## Lo que **no** entra en este spec

- `CHECK` de marca.
- Disponibilidad de patente en `onBlur`.
- Guardado transaccional de perfil y vehículo.
- Unicidad de teléfono.
- Colores editables sin migración.
- Reclamo por patente registrada por otro.
- Capacidad en el despacho de viajes.

Cada uno de esos, si aterriza, va en su propio spec.
