# SPEC 21 — Validación de alias/CVU y contactos

> **Estado:** implementado
> **Depende de:** SPEC 12, SPEC 15, SPEC 19
> **Fecha:** 2026-10-05
> **Objetivo:** Que el alias o CVU/CBU de cobro tenga un formato real (alias de 6 a 20 caracteres o 22 dígitos con verificador correcto) y que el teléfono de los contactos de confianza cumpla la regla del Spec 19 también en la base.

Hoy `guardarAliasCvu` (`app/actions/pagos-transferencia.ts`) sólo hace `trim` y pone un tope de 60 caracteres: acepta `hola`, `123` o un CVU con un dígito mal tipeado, y el pasajero termina transfiriendo a una cuenta que no existe. El error sale en el `MensajeError` general de `/perfil/pagos`.

El teléfono de los contactos de confianza ya se valida en la app con `validarTelefono` (Spec 19), pero el Spec 19 dejó fuera el `CHECK` en `contactos_confianza`: un insert por fuera de la app, o un teléfono viejo que la 0019 no pudo normalizar, sigue sin control.

## Alcance

**Incluye:**

- `lib/validacion.ts`: `validarAliasCvu`, que distingue CVU/CBU de alias y normaliza.
  - **CVU/CBU:** si el valor, sin espacios ni guiones, tiene sólo dígitos, se trata como CVU/CBU: tienen que ser 22 dígitos y los dos dígitos verificadores tienen que dar bien (algoritmo del BCRA, ver abajo). Se aceptan CVU (billeteras, empiezan con `000`) y CBU (bancos). Se guarda sólo los 22 dígitos.
  - **Alias:** si no, se trata como alias: `trim`, minúsculas, 6 a 20 caracteres, sólo letras `a-z` (sin `ñ` ni tildes), dígitos, punto y guion. Se guarda en minúsculas.
- `app/actions/pagos-transferencia.ts` (`guardarAliasCvu`): usa `validarAliasCvu`; devuelve `errores.alias_cvu` y `valores`; se borra `ALIAS_MAX`.
- `app/perfil/pagos/pagos-form.tsx`: error debajo del campo con `ErrorCampo`, `aria-invalid`/`aria-describedby`, validación al salir del campo (`onBlur`) con `useErroresCampo`, valor conservado después de un envío con errores, `maxLength={40}` (deja lugar a un CVU con espacios).
- Migración `supabase/migrations/0021_validacion_alias_cvu_y_contactos.sql` (idempotente):
  - Verifica primero los datos existentes y **aborta** listando las filas que, aun normalizadas, no cumplirían el formato. No corrige ni borra nada de eso.
  - Normaliza `profiles.alias_cvu` (CVU sin separadores, alias en minúsculas, vacío a `NULL`) y `contactos_confianza.telefono` (con `public.normalizar_telefono()` de la 0019).
  - `CHECK` validados: `profiles_alias_cvu_formato` y `contactos_telefono_formato`.

**Fuera de alcance (para specs futuros):**

- Verificar que la cuenta exista o consultar el titular (requiere una API bancaria o del BCRA).
- Dígito verificador en la base: queda sólo en la app.
- Mostrar el CVU con formato (`0000003 1 1000123456789 8`) en pantalla.
- Cambiar el texto "Alias guardado." según sea alias o CVU.
- Cuentas del exterior.
- Unicidad del alias/CVU entre cuentas (una remisería y su conductor pueden compartirlo).
- Validar el nombre del contacto en la base.
- Corregir teléfonos o nombres de `profiles` que no cumplen los `CHECK NOT VALID` del Spec 19.

## Modelo de datos

No hay columnas ni tablas nuevas: `lib/supabase/types.ts` no cambia. Cambia el formato de `profiles.alias_cvu` y se agregan dos restricciones:

| Restricción | Tabla | Regla |
| --- | --- | --- |
| `profiles_alias_cvu_formato` | `profiles` | `alias_cvu is null or alias_cvu ~ '^[0-9]{22}$' or alias_cvu ~ '^[a-z0-9.-]{6,20}$'` |
| `contactos_telefono_formato` | `contactos_confianza` | `telefono ~ '^[0-9]{10}$'` |

### `lib/validacion.ts`

```ts
export function validarAliasCvu(crudo: string): Resultado;
```

Clasificación y normalización, en este orden:

1. `t = crudo.trim()`. Vacío → "Ingresá tu alias o CVU."
2. `d = t` sin espacios ni guiones. Si `d` tiene sólo dígitos, es CVU/CBU:
   - `d.length !== 22` → "El CVU o CBU tiene que tener 22 números."
   - verificador mal → "Revisá el CVU o CBU: hay un número mal."
   - si no, `ok(d)`.
3. Si no, es alias: `a = t.toLowerCase()`; si no cumple `^[a-z0-9.-]{6,20}$` → "El alias tiene que tener entre 6 y 20 letras, números, puntos o guiones."; si no, `ok(a)`.

### Dígitos verificadores del CVU/CBU

Dos bloques, cada uno con su verificador al final. Para cada bloque: multiplicar cada dígito por su peso, sumar, y el verificador es `(10 - suma % 10) % 10`.

- Bloque 1: dígitos 1 a 7, pesos `7 1 3 9 7 1 3`; verificador = dígito 8.
- Bloque 2: dígitos 9 a 21, pesos `3 9 7 1 3 9 7 1 3 9 7 1 3`; verificador = dígito 22.

Ejemplos: `2850590940090418135201` (CBU) y `0000003110001234567898` (CVU) son válidos; `0000003110001234567899` tiene mal el verificador.

### Estado de `guardarAliasCvu`

```ts
export type AliasState =
  | {
      error?: string;
      errores?: ErroresCampo<"alias_cvu">;
      valores?: { alias_cvu: string };
    }
  | { ok: true }
  | undefined;
```

`error` queda para lo que no es del campo: pasajero intentando cargar datos de cobro y falla de Supabase.

### Migración `0021_validacion_alias_cvu_y_contactos.sql`

```sql
-- SPEC 21 — Validación de alias/CVU y contactos
-- Idempotente: seguro de re-ejecutar. Aborta sin cambiar nada si hay
-- datos que no cumplen y no se pueden corregir solos.

-- Misma normalización que validarAliasCvu() en lib/validacion.ts (sin el
-- dígito verificador): CVU/CBU sin espacios ni guiones, alias en minúsculas,
-- vacío a NULL.
create or replace function public.normalizar_alias_cvu(p text)
returns text
language sql
immutable
as $$
  select case
    when btrim(coalesce(p, '')) = '' then null
    when regexp_replace(p, '[\s-]', '', 'g') ~ '^[0-9]+$'
      then regexp_replace(p, '[\s-]', '', 'g')
    else lower(btrim(p))
  end;
$$;

-- 1. Verificar antes de cualquier update. Los CHECK NOT VALID del Spec 19 en
--    profiles rigen para toda fila que se actualice, así que normalizar el
--    alias de un perfil con teléfono o nombre inválido fallaría: también se
--    listan esos casos.
do $$
declare
  problemas text;
begin
  select string_agg(p, E'\n') into problemas from (
    select 'alias/CVU inválido "' || alias_cvu || '" (' || id || ')' as p
      from public.profiles
     where public.normalizar_alias_cvu(alias_cvu) is not null
       and public.normalizar_alias_cvu(alias_cvu) !~ '^([0-9]{22}|[a-z0-9.-]{6,20})$'
    union all
    select 'perfil con alias a normalizar y teléfono/nombre fuera del Spec 19 (' || id || ')'
      from public.profiles
     where alias_cvu is distinct from public.normalizar_alias_cvu(alias_cvu)
       and not (
         (telefono is null or telefono ~ '^[0-9]{10}$') and
         (nombre is null or (nombre = btrim(nombre) and char_length(nombre) between 2 and 100))
       )
    union all
    select 'teléfono de contacto inválido "' || telefono || '" (' || id || ')'
      from public.contactos_confianza
     where public.normalizar_telefono(telefono) is null
  ) t;

  if problemas is not null then
    raise exception E'SPEC 21: corregí estas filas y volvé a correr la migración:\n%', problemas;
  end if;
end;
$$;

-- 2. Normalizar.
update public.profiles
   set alias_cvu = public.normalizar_alias_cvu(alias_cvu)
 where alias_cvu is distinct from public.normalizar_alias_cvu(alias_cvu);

update public.contactos_confianza
   set telefono = public.normalizar_telefono(telefono)
 where telefono <> public.normalizar_telefono(telefono);

-- 3. Restricciones.
alter table public.profiles drop constraint if exists profiles_alias_cvu_formato;
alter table public.profiles add constraint profiles_alias_cvu_formato
  check (alias_cvu is null
         or alias_cvu ~ '^[0-9]{22}$'
         or alias_cvu ~ '^[a-z0-9.-]{6,20}$');

alter table public.contactos_confianza drop constraint if exists contactos_telefono_formato;
alter table public.contactos_confianza add constraint contactos_telefono_formato
  check (telefono ~ '^[0-9]{10}$');
```

`public.normalizar_telefono()` ya existe desde la 0019. Postgres corre el archivo en una transacción en el SQL Editor de Supabase: si aborta, no queda nada aplicado.

El `CHECK` de alias es más laxo que la app: no controla el dígito verificador, y un alias de 6 a 20 dígitos pasa en la base aunque la app lo trate como CVU incompleto.

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Commit 1 — este spec.** `specs/21-validacion-alias-cvu-y-contactos.md`.

2. **Validador.** `validarAliasCvu` y el cálculo del verificador en `lib/validacion.ts`. *Verificación:* `npm run lint` pasa; un script temporal en el scratchpad (no commiteado) corre los ejemplos de "Dígitos verificadores" y los casos 1–5 del caso de prueba y da lo esperado.

3. **Migración.** `supabase/migrations/0021_validacion_alias_cvu_y_contactos.sql` y aplicarla en Supabase. *Verificación:* corre dos veces sin error; las dos restricciones aparecen en `pg_constraint` con `convalidated = true`; filas 9–11 del caso de prueba.

4. **Acción y formulario de pagos.** `guardarAliasCvu` y `pagos-form.tsx`. *Verificación:* filas 1–8 del caso de prueba.

5. **Prueba end-to-end.** Ver "Caso de prueba". *Verificación:* todos los criterios de aceptación, más `npm run build` y `npm run lint`.

## Caso de prueba

Precondición: `npm run dev` corriendo en `http://localhost:3000`, migración 0021 aplicada y una cuenta de conductor.

| # | Paso | Resultado esperado |
| --- | --- | --- |
| 1 | En `/perfil/pagos`, escribir `hola` y salir del campo. | "El alias tiene que tener entre 6 y 20 letras, números, puntos o guiones." debajo del campo, sin enviar. Al escribir, el error se va. |
| 2 | Escribir `12345` y guardar. | "El CVU o CBU tiene que tener 22 números." debajo del campo. El valor sigue en el input. |
| 3 | Escribir `0000003110001234567899` y guardar. | "Revisá el CVU o CBU: hay un número mal." |
| 4 | Escribir `0000003 1 1000123456789 8` y guardar. | Se guarda como `0000003110001234567898`; aparece "Alias guardado." y el input muestra el valor normalizado. |
| 5 | Escribir `Mi.Alias-MP` y guardar. | Se guarda como `mi.alias-mp`. |
| 6 | Escribir `mi.alias.ñandú` y guardar. | Error de alias debajo del campo. |
| 7 | Escribir `2850590940090418135201` (CBU) y guardar. | Se guarda. |
| 8 | Dejar el campo vacío y guardar (sacando `required` desde las herramientas del navegador). | "Ingresá tu alias o CVU." debajo del campo. |
| 9 | En el SQL Editor, `update profiles set alias_cvu = 'ab' where id = '<conductor>'`. | Falla por `profiles_alias_cvu_formato`. |
| 10 | En el SQL Editor, `insert into contactos_confianza (usuario_id, nombre, telefono) values ('<usuario>', 'Test', '123')`. | Falla por `contactos_telefono_formato`. |
| 11 | En `/perfil/contactos`, agregar `Mamá` con `0341 15 555-1234`. | Se agrega y la lista muestra `3415551234` (regla de la 19, sin cambios). |

## Criterios de aceptación

- [ ] `validarAliasCvu` existe en `lib/validacion.ts` y es la única regla de alias/CVU: `rg "ALIAS_MAX" app` no da resultados.
- [ ] Un CVU/CBU sólo se acepta con 22 dígitos y ambos verificadores correctos; se guarda sin separadores.
- [ ] Un alias sólo se acepta con 6 a 20 caracteres `a-z`, dígitos, punto o guion; se guarda en minúsculas.
- [ ] En `/perfil/pagos` el error aparece debajo del campo, al salir del campo y al enviar, con el mismo texto; el input tiene `aria-invalid="true"` y `aria-describedby`; el valor se conserva tras un envío con errores.
- [ ] `profiles_alias_cvu_formato` y `contactos_telefono_formato` existen con `convalidated = true` y rechazan un valor inválido escrito por fuera de la app.
- [ ] La migración 0021 corre dos veces seguidas sin error sobre datos válidos y, con datos inválidos, aborta listando todas las filas sin aplicar nada.
- [ ] La migración no borra filas; sólo normaliza alias/CVU (vacío pasa a `NULL`) y teléfonos de contactos.
- [ ] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** aceptar CVU y CBU. **No:** sólo CVU. Muchos conductores cobran en una cuenta bancaria; los dos tienen la misma estructura de 22 dígitos.
- **Sí:** verificar los dos dígitos verificadores en la app. **No:** sólo contar 22 dígitos. Un dígito mal tipeado manda la plata del pasajero a una cuenta que no existe.
- **No:** el verificador en el `CHECK`. Replicar el algoritmo en SQL suma una función más que mantener en paralelo; la base controla la forma y la app la validez.
- **Sí:** alias en minúsculas. **No:** guardarlo tal como se escribe ni en mayúsculas. El alias no distingue mayúsculas; un solo formato, igual que el email en la 19.
- **Sí:** quitar espacios y guiones de un CVU/CBU. **No:** exigir los 22 dígitos juntos. Mismo criterio que la patente y el teléfono en la 19.
- **Sí:** clasificar como CVU/CBU todo lo que, sin espacios ni guiones, sea sólo dígitos. **No:** pedirle al usuario que elija el tipo. Un alias de sólo números es raro y el error le explica qué hacer.
- **Sí:** error debajo del campo con `onBlur`, como los formularios de la 19. **No:** mantener el `MensajeError` general.
- **Sí:** mensajes distintos para largo de CVU, verificador y alias. **No:** un único "inválido". Cada caso se arregla distinto.
- **Sí:** `CHECK` validados y migración que verifica antes de normalizar y aborta listando, como la 0020. **No:** `NOT VALID` como la 0019, ni poner en NULL los alias inválidos.
- **Sí:** listar en la verificación los perfiles con alias a normalizar cuyo teléfono o nombre no cumplen los `CHECK NOT VALID` del Spec 19. **No:** descubrirlo cuando el `update` falla. Es lo que pasó en la 0020.
- **Sí:** `CHECK` de teléfono en `contactos_confianza`. Revierte la decisión del Spec 19 de no ponerlo.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Algún CVU de billetera usa otro cálculo de verificador y se rechaza un CVU real. | El paso 2 prueba el algoritmo con un CBU y un CVU reales además de los ejemplos. Si aparece un caso real rechazado, se ajusta en un spec aparte. |
| Alguien tiene un alias de sólo números y la app lo trata como CVU incompleto. | El mensaje "tiene que tener 22 números" le indica que se interpretó como CVU; puede cargar el CVU de la cuenta. |
| Un CVU viejo guardado con verificador mal pasa la migración (el `CHECK` no lo controla). | Se rechaza la próxima vez que el conductor guarde el formulario. |
| La migración aborta por perfiles con teléfono o nombre viejos fuera del Spec 19 que tienen alias a normalizar. | Se listan con su `id`; se corrigen a mano como en la 0020. |
| `normalizar_alias_cvu()` en SQL y `validarAliasCvu()` en TypeScript se desincronizan. | La función SQL sólo normaliza datos viejos; los nuevos los normaliza la app. Los ejemplos del spec sirven para ambas. |

## Lo que **no** entra en este spec

- Verificar existencia o titular de la cuenta.
- Dígito verificador en la base.
- Formato del CVU en pantalla.
- Cuentas del exterior.
- Unicidad del alias/CVU.
- Corrección de perfiles fuera de los `CHECK` del Spec 19.

Cada uno de esos, si aterriza, va en su propio spec.
