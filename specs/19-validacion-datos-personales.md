# SPEC 19 — Validación de datos personales

> **Estado:** implementado
> **Depende de:** SPEC 01, SPEC 02, SPEC 12, SPEC 14
> **Fecha:** 2026-10-03
> **Objetivo:** Que nombre, teléfono, email y datos del vehículo se validen con las mismas reglas en registro, perfil, login, recuperación y contactos de confianza —desde un único `lib/validacion.ts`, con el error debajo de cada campo y `CHECK` en la base como red de seguridad.

Hoy cada Server Action trae su propia copia de las reglas: `TELEFONO_RE = /^[0-9+\-\s]{8,}$/` está repetido en `app/actions/auth.ts`, `app/actions/perfil.ts` y `app/actions/seguridad.ts`, y acepta cosas como `"++++ ----"`. El nombre sólo se chequea con "no vacío", la patente es texto libre y el email sólo se mira en registro y recuperación. Además, cada formulario muestra **un solo** error general abajo de todo (`MensajeError`), así que con dos campos mal el usuario los descubre de a uno. Y como React 19 resetea el formulario cuando termina la acción, en `/registro` un error borra todo lo escrito.

Este spec junta las reglas en un módulo puro compartido por servidor y cliente, normaliza lo que se guarda (teléfono en 10 dígitos, patente en mayúsculas sin separadores), muestra cada error debajo de su campo y agrega `CHECK` en `profiles` y `vehicles`.

## Alcance

**Incluye:**

- `lib/validacion.ts` (nuevo, sin dependencias de servidor ni de React): funciones puras que validan **y normalizan** cada dato. Las usan las Server Actions y los formularios cliente.
- Reglas:
  - **Nombre de persona** (nombre y apellido de pasajero y conductor; nombre del contacto de confianza): 2 a 40 caracteres tras `trim`, sólo letras (incluidas tildes, `ü` y `ñ`), espacio, apóstrofo y guion; los espacios internos repetidos se colapsan a uno.
  - **Nombre de remisería** (rol `empresa`): 2 a 60 caracteres tras `trim`, admite además dígitos, punto y `&`.
  - **Teléfono**: se aceptan espacios, guiones, paréntesis, `+54`, `9` internacional, `0` de larga distancia y `15` de celular al escribir; se guarda **siempre** como 10 dígitos (código de área + número, p. ej. `3415551234`).
  - **Email**: `trim` + minúsculas y el mismo criterio que hoy (`algo@algo.algo`, sin espacios), con tope de 254 caracteres.
  - **Patente**: se quitan espacios, guiones y puntos, se pasa a mayúsculas y se acepta formato viejo `ABC123` o Mercosur `AB123CD`.
  - **Marca**: se elige de una lista cerrada de marcas (`MARCAS` en `lib/validacion.ts`) en un `<select>`; el servidor rechaza cualquier valor que no esté en la lista.
  - **Modelo**: el nombre del auto (p. ej. `Corolla`), 2 a 30 caracteres tras `trim`.
  - **Color**: se elige de una lista cerrada de colores (`COLORES` en `lib/validacion.ts`) en un `<select>`; el servidor rechaza cualquier valor que no esté en la lista.
  - **Capacidad**: entero entre 1 y 10 (igual que hoy).
- Errores por campo: las acciones devuelven `{ errores: { campo: mensaje }, valores }` y cada formulario muestra el mensaje debajo de su input. El `MensajeError` general queda sólo para errores que no son de un campo (servidor caído, email ya registrado, credenciales incorrectas, términos sin aceptar).
- Validación en el cliente al salir de cada campo (`onBlur`) con las mismas funciones; el error desaparece al corregir el campo.
- Los valores escritos se conservan cuando la acción devuelve errores (dejan de borrarse en `/registro`).
- Formularios alcanzados: `/registro`, `/perfil/editar` (incluido el bloque del vehículo), `/login`, `/recuperar` y el alta de contactos en `/perfil/contactos`.
- Migración `supabase/migrations/0019_validacion_datos_personales.sql` (idempotente):
  - Normaliza los `telefono` existentes de `profiles` y `contactos_confianza` y las `patente` de `vehicles` cuando se puede; recorta espacios al borde de `nombre`.
  - Agrega `CHECK ... NOT VALID` en `profiles` (nombre y teléfono) y en `vehicles` (patente, marca, modelo, color).

**Fuera de alcance (para specs futuros):**

- Cambiar el email desde el perfil (`supabase.auth.updateUser` con confirmación por mail).
- Verificación de identidad: DNI, licencia de conducir, fotos o revisión manual.
- Verificar que el teléfono existe (código por SMS o WhatsApp).
- Mostrar el teléfono con formato (`341 555-1234`) en pantalla: se muestra tal como se guarda.
- Teléfonos extranjeros.
- Patentes de moto u otros formatos especiales.
- Unicidad de patente o de teléfono entre cuentas.
- Reglas nuevas para la contraseña (sigue siendo mínimo 8 caracteres).
- `CHECK` en `contactos_confianza`.
- Validación de los formularios de pagos y reclamos.
- Año del vehículo y antigüedad máxima permitida.
- Lista de modelos por marca.

## Modelo de datos

No hay columnas ni tablas nuevas: `lib/supabase/types.ts` no cambia. Sí cambia el **formato** de lo que se guarda en `profiles.telefono`, `contactos_confianza.telefono` y `vehicles.patente`.

### `lib/validacion.ts`

Cada validador recibe el valor crudo del formulario y devuelve el valor normalizado o el mensaje de error.

```ts
export type Resultado = { ok: true; valor: string } | { ok: false; error: string };

export function validarNombrePersona(crudo: string, etiqueta?: "nombre" | "apellido"): Resultado;
export function validarNombreEmpresa(crudo: string): Resultado;
export function validarTelefono(crudo: string): Resultado;
export function validarEmail(crudo: string): Resultado;
export function validarPatente(crudo: string): Resultado;
export const MARCAS: readonly string[];  // Alfa Romeo, Audi, BAIC, BMW, BYD, Chery, Chevrolet, Chrysler, Citroën, Dodge, DS, Fiat, Ford, Geely, Haval, Honda, Hyundai, JAC, Jeep, Kia, Lifan, Mercedes-Benz, Mini, Mitsubishi, Nissan, Peugeot, RAM, Renault, Seat, Subaru, Suzuki, Toyota, Volkswagen, Volvo
export const COLORES: readonly string[]; // Blanco, Negro, Gris, Plata, Rojo, Bordó, Azul, Celeste, Verde, Amarillo, Naranja, Marrón, Beige, Dorado, Violeta

export function validarMarca(crudo: string): Resultado;
export function validarColor(crudo: string): Resultado;
export function validarTextoVehiculo(crudo: string, etiqueta: "modelo"): Resultado;
export function validarCapacidad(crudo: string): { ok: true; valor: number } | { ok: false; error: string };

// Errores por campo que devuelven las Server Actions.
export type ErroresCampo<C extends string> = Partial<Record<C, string>>;
```

Mensajes (uno por regla, en el tono de los actuales):

| Validador | Caso | Mensaje |
| --- | --- | --- |
| `validarNombrePersona` | vacío | "Ingresá tu nombre." / "Ingresá tu apellido." |
| | largo fuera de 2–40 | "Tiene que tener entre 2 y 40 caracteres." |
| | caracteres inválidos | "Usá sólo letras, espacios, apóstrofo o guion." |
| `validarNombreEmpresa` | vacío | "Ingresá el nombre de la remisería." |
| | largo fuera de 2–60 | "Tiene que tener entre 2 y 60 caracteres." |
| | caracteres inválidos | "Usá letras, números, espacios, punto, guion o &." |
| `validarTelefono` | vacío | "Ingresá tu teléfono." |
| | no da 10 dígitos | "Ingresá el código de área y el número, por ejemplo 341 555-1234." |
| `validarEmail` | vacío o inválido | "Ingresá un email válido." |
| `validarPatente` | vacío | "Ingresá la patente." |
| | formato inválido | "La patente tiene que ser como ABC123 o AB123CD." |
| `validarMarca` | vacío o fuera de la lista | "Elegí la marca." / "Elegí una marca de la lista." |
| `validarColor` | vacío o fuera de la lista | "Elegí el color." / "Elegí un color de la lista." |
| `validarTextoVehiculo` | vacío o largo fuera de 2–30 | "Completá el modelo." / "Tiene que tener entre 2 y 30 caracteres." |
| `validarCapacidad` | no entero o fuera de 1–10 | "La capacidad debe ser un número entero entre 1 y 10." |

En el contacto de confianza el mensaje de nombre vacío es "Ingresá el nombre del contacto." (parámetro de mensaje o validador envoltorio, a criterio de la implementación).

### Normalización del teléfono

Sobre el valor crudo, en este orden:

1. Quitar todo lo que no sea dígito.
2. Si empieza con `54` y quedan 12 o más dígitos, quitar el `54`.
3. Si después de eso empieza con `9` y quedan 11 dígitos, quitar el `9` (celular en formato internacional).
4. Si empieza con `0`, quitar el `0`.
5. Si quedan 12 dígitos, buscar `15` en la posición 2, 3 o 4 (en ese orden, según el código de área tenga 2, 3 o 4 dígitos) y quitar la primera coincidencia.
6. Es válido si quedan exactamente 10 dígitos.

Ejemplos: `+54 9 341 555-1234`, `0341 15 555-1234`, `(341) 555 1234` y `3415551234` dan `3415551234`; `11 15 5555-1234` da `1155551234`; `555-1234` es inválido.

### Normalización de la patente

Quitar espacios, guiones y puntos, pasar a mayúsculas y validar contra `^([A-Z]{3}[0-9]{3}|[A-Z]{2}[0-9]{3}[A-Z]{2})$`. `ab 123 cd` se guarda como `AB123CD`.

### Estado de las Server Actions

```ts
// app/actions/auth.ts
export type AuthState =
  | {
      error?: string;
      aviso?: string;
      errores?: ErroresCampo<"nombre" | "apellido" | "email" | "telefono" | "password">;
      valores?: Record<string, string>; // lo que escribió el usuario, sin la contraseña
    }
  | undefined;

// app/actions/perfil.ts
export type PerfilState =
  | {
      error?: string;
      errores?: ErroresCampo<"nombre" | "telefono" | "marca" | "modelo" | "patente" | "color" | "capacidad">;
      valores?: Record<string, string>;
    }
  | undefined;

// app/actions/seguridad.ts
export type ContactoState =
  | { error?: string; errores?: ErroresCampo<"nombre" | "telefono">; valores?: Record<string, string> }
  | undefined;
```

Las acciones validan **todos** los campos antes de cortar y devuelven todos los errores juntos. Con algún error no tocan Supabase. La contraseña nunca vuelve en `valores`.

`registrarse` valida nombre y apellido por separado (o el nombre de la remisería) y después los une como hoy. El teléfono normalizado es el que va a `profiles` **y** a `user_metadata`, para que `/perfil/editar` lo precargue ya normalizado.

### Migración `0019_validacion_datos_personales.sql`

```sql
-- SPEC 19 — Validación de datos personales
-- Idempotente: seguro de re-ejecutar.

-- Misma normalización que validarTelefono() en lib/validacion.ts.
-- Devuelve NULL si el valor no llega a 10 dígitos.
create or replace function public.normalizar_telefono(p text)
returns text
language plpgsql
immutable
as $$
declare
  d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if d like '54%' and length(d) >= 12 then d := substr(d, 3); end if;
  if d like '9%' and length(d) = 11 then d := substr(d, 2); end if;
  if d like '0%' then d := substr(d, 2); end if;
  if length(d) = 12 then
    if substr(d, 3, 2) = '15' then d := substr(d, 1, 2) || substr(d, 5);
    elsif substr(d, 4, 2) = '15' then d := substr(d, 1, 3) || substr(d, 6);
    elsif substr(d, 5, 2) = '15' then d := substr(d, 1, 4) || substr(d, 7);
    end if;
  end if;
  return case when d ~ '^[0-9]{10}$' then d else null end;
end;
$$;

-- Datos existentes: se normaliza sólo lo que da un valor válido;
-- lo demás queda como está (los CHECK son NOT VALID).
update public.profiles
   set telefono = public.normalizar_telefono(telefono)
 where telefono is not null
   and public.normalizar_telefono(telefono) is not null
   and telefono <> public.normalizar_telefono(telefono);

update public.contactos_confianza
   set telefono = public.normalizar_telefono(telefono)
 where public.normalizar_telefono(telefono) is not null
   and telefono <> public.normalizar_telefono(telefono);

update public.profiles
   set nombre = regexp_replace(btrim(nombre), '\s+', ' ', 'g')
 where nombre is not null
   and nombre <> regexp_replace(btrim(nombre), '\s+', ' ', 'g');

update public.vehicles
   set patente = upper(regexp_replace(patente, '[\s.\-]', '', 'g'))
 where patente <> upper(regexp_replace(patente, '[\s.\-]', '', 'g'));

-- CHECK: rigen para todo insert/update nuevo. NOT VALID para no fallar
-- si queda alguna fila vieja que no se pudo normalizar.
alter table public.profiles drop constraint if exists profiles_telefono_formato;
alter table public.profiles add constraint profiles_telefono_formato
  check (telefono is null or telefono ~ '^[0-9]{10}$') not valid;

alter table public.profiles drop constraint if exists profiles_nombre_formato;
alter table public.profiles add constraint profiles_nombre_formato
  check (nombre is null or (nombre = btrim(nombre) and char_length(nombre) between 2 and 100)) not valid;

alter table public.vehicles drop constraint if exists vehicles_patente_formato;
alter table public.vehicles add constraint vehicles_patente_formato
  check (patente ~ '^([A-Z]{3}[0-9]{3}|[A-Z]{2}[0-9]{3}[A-Z]{2})$') not valid;

alter table public.vehicles drop constraint if exists vehicles_textos_largo;
alter table public.vehicles add constraint vehicles_textos_largo
  check (
    char_length(btrim(marca))  between 2 and 30 and
    char_length(btrim(modelo)) between 2 and 30 and
    char_length(btrim(color))  between 2 and 30
  ) not valid;
```

El `CHECK` de nombre en `profiles` es deliberadamente más laxo que `lib/validacion.ts` (largo 2–100, sin espacios al borde, sin restricción de caracteres): cubre persona (nombre + apellido, hasta 81) y remisería (hasta 60) sin replicar en SQL las reglas por rol. `nombre` y `telefono` siguen siendo NULL-eables por el trigger `handle_new_user` del Spec 01.

Marca y color **no** llevan `CHECK`: las listas viven sólo en `lib/validacion.ts` para no mantenerlas duplicadas en SQL.

### Componentes de UI

- `components/ui.tsx`: `ErrorCampo({ id, children })`, un `<p id={id} className="text-[13px] font-medium text-peligro">` para debajo del input.
- Cada input con error lleva `aria-invalid="true"` y `aria-describedby` apuntando al `id` de su `ErrorCampo`, y un borde de error (variante de `inputCls`).
- Los formularios combinan el error del servidor (`state.errores[campo]`) con el del cliente (`onBlur`); el del cliente tiene prioridad mientras el usuario edita, y escribir en el campo limpia el error mostrado.

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Commit 1 — este spec.** `specs/19-validacion-datos-personales.md`.

2. **Módulo de validación.** `lib/validacion.ts` con los validadores, la normalización de teléfono y patente y el tipo `ErroresCampo`. *Verificación:* `npm run lint` pasa; un script temporal en el scratchpad (no commiteado) corre los ejemplos de "Normalización del teléfono" y "Normalización de la patente" y da los valores esperados.

3. **Migración.** `supabase/migrations/0019_validacion_datos_personales.sql` y aplicarla en Supabase. *Verificación:* corre dos veces sin error; `select public.normalizar_telefono('0341 15 555-1234')` da `3415551234`; un `update profiles set telefono = '123'` del propio usuario falla con `profiles_telefono_formato`.

4. **UI de error por campo.** `ErrorCampo` y la variante de borde de error en `components/ui.tsx`. *Verificación:* `npm run lint` pasa (todavía sin usar).

5. **Registro y login.** `app/actions/auth.ts`: `registrarse`, `iniciarSesion` y `pedirRecuperacion` usan `lib/validacion.ts`, devuelven `errores` y `valores`; se borran `EMAIL_RE` y `TELEFONO_RE` locales. `app/registro/page.tsx`, `app/login/page.tsx` y `app/recuperar/recuperar-form.tsx`: error debajo de cada campo, `onBlur`, `defaultValue` desde `state.valores`. *Verificación:* filas 1–6 del caso de prueba.

6. **Perfil.** `app/actions/perfil.ts` (`guardarPerfil`) y `app/perfil/perfil-form.tsx` (incluido el vehículo): mismas reglas, errores por campo, valores conservados; se borra `TELEFONO_RE` local. *Verificación:* filas 7–10 del caso de prueba.

7. **Contactos de confianza.** `app/actions/seguridad.ts` (`agregarContacto`) y `app/perfil/contactos/contactos-form.tsx`; se borra `TELEFONO_RE` local. *Verificación:* fila 11 del caso de prueba.

8. **Marca y color del vehículo.** `MARCAS`, `COLORES`, `validarMarca` y `validarColor` en `lib/validacion.ts`; en `app/perfil/perfil-form.tsx`, marca y color pasan a `<select>`; `guardarPerfil` los valida contra la lista. *Verificación:* filas 7, 8 y 12 del caso de prueba.

9. **Prueba end-to-end.** Ver "Caso de prueba". *Verificación:* todos los criterios de aceptación, más `npm run build` y `npm run lint`.

## Caso de prueba

Precondición: `npm run dev` corriendo en `http://localhost:3000` y la migración 0019 aplicada en Supabase.

| # | Paso | Resultado esperado |
| --- | --- | --- |
| 1 | En `/registro` (pasajero), escribir nombre `J`, apellido `P3rez`, email `juan@`, teléfono `555-1234` y enviar. | Aparecen **cuatro** errores, cada uno debajo de su campo. Los valores escritos siguen en los inputs (la contraseña no). No se crea ninguna cuenta. |
| 2 | Escribir `J` en "Nombre" y pasar al campo siguiente, sin enviar. | El error "Tiene que tener entre 2 y 40 caracteres." aparece debajo de "Nombre" al salir del campo. Al escribir `Juan`, el error se va. |
| 3 | Registrar un pasajero con nombre `  María José `, apellido `O'Connor-Díaz`, teléfono `0341 15 555-1234`. | La cuenta se crea. En `profiles`: `nombre = 'María José O''Connor-Díaz'`, `telefono = '3415551234'`. |
| 4 | Registrar una remisería con nombre `Remis 24 & Cía.` y teléfono `+54 9 11 5555-1234`. | La cuenta se crea con `nombre = 'Remis 24 & Cía.'` y `telefono = '1155551234'`. |
| 5 | En `/login`, escribir `no-es-un-email` y enviar. | Error "Ingresá un email válido." debajo del campo email; no se llama a Supabase. Con email válido y contraseña incorrecta, sigue el error general "Email o contraseña incorrectos." |
| 6 | En `/recuperar`, escribir `x@y` y enviar. | Error debajo del campo email. Con un email válido, el aviso de siempre. |
| 7 | En `/perfil/editar` (conductor), poner patente `ab 123 cd`, dejar el color sin elegir y guardar. | Error sólo debajo de "Color" ("Elegí el color."). Al elegir un color y guardar, `vehicles.patente = 'AB123CD'`. |
| 8 | Poner patente `A1B2C3` y capacidad `12` y guardar. | Dos errores, debajo de "Patente" y "Capacidad". El resto de los valores sigue en el formulario. |
| 12 | Abrir los selectores de "Marca" y "Color"; con una cuenta cuya marca o color guardados no están en la lista, abrir el formulario. | Sólo ofrecen los valores de la lista. Si el valor guardado no está en la lista, el selector aparece sin elegir y hay que elegir uno para guardar. Después de un envío con errores, la marca y el color elegidos se conservan. |
| 9 | Con un perfil creado antes de este spec y teléfono `341-555-1234`, abrir `/perfil/editar`. | El campo muestra `3415551234` (normalizado por la migración); guardar sin cambios funciona. |
| 10 | Desde la consola de Supabase, como ese usuario, intentar `update profiles set telefono = 'abc'`. | Falla por `profiles_telefono_formato`. |
| 11 | En `/perfil/contactos`, agregar contacto `M` con teléfono `123`; después `Mamá` con `341 555 1234`. | Primero, dos errores debajo de sus campos. Después el contacto se agrega y la lista muestra `3415551234`. |

## Criterios de aceptación

- [ ] `lib/validacion.ts` existe, no importa nada de servidor ni de React y es la única fuente de las reglas: `rg "TELEFONO_RE|EMAIL_RE" app` no da resultados.
- [ ] Con varios campos inválidos, el formulario muestra un error debajo de **cada** campo inválido en el mismo envío.
- [ ] Al salir de un campo inválido aparece su error sin enviar el formulario, con el mismo texto que daría el servidor.
- [ ] Después de un envío con errores, los campos conservan lo escrito (salvo la contraseña).
- [ ] Todo teléfono guardado desde la app en `profiles` y `contactos_confianza` tiene exactamente 10 dígitos.
- [ ] Marca y color sólo se pueden elegir de su lista, y el servidor rechaza un valor fuera de ella.
- [ ] Toda patente guardada desde la app está en mayúsculas, sin separadores y con formato `ABC123` o `AB123CD`.
- [ ] Un pasajero o conductor no puede guardar nombre o apellido con dígitos o símbolos; una remisería sí puede usar dígitos, punto y `&`.
- [ ] Los `CHECK` `profiles_telefono_formato`, `profiles_nombre_formato`, `vehicles_patente_formato` y `vehicles_textos_largo` existen y rechazan un `update` inválido hecho por fuera de la app.
- [ ] La migración 0019 corre dos veces seguidas sin error y no borra ni pone en NULL datos existentes.
- [ ] Los errores que no son de un campo (servidor caído, email ya registrado, credenciales incorrectas, términos) siguen apareciendo como hoy, en el `MensajeError` general.
- [ ] Los inputs con error tienen `aria-invalid="true"` y `aria-describedby` apuntando a su mensaje.
- [ ] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** un `lib/validacion.ts` puro compartido por Server Actions y formularios. **No:** una librería de esquemas (zod, valibot). Son siete reglas; una dependencia nueva no se justifica y el proyecto no usa ninguna hoy.
- **Sí:** validar en el servidor siempre y en el cliente al salir del campo. **No:** sólo en el cliente. El servidor es el que manda; el cliente sólo adelanta el aviso con las mismas funciones, así los mensajes no se desincronizan.
- **Sí:** guardar el teléfono normalizado a 10 dígitos argentinos. **No:** guardarlo como lo escribió el usuario, ni aceptar números extranjeros. La app opera en Argentina, y un formato único sirve directo para `tel:` y `sms:` (ya se usa en `viaje-pendiente.tsx`).
- **Sí:** regla de nombre distinta para la remisería. **No:** la misma regla de persona para los tres roles. El `nombre` de la empresa es una razón social y puede llevar números, punto o `&`.
- **Sí:** `CHECK` en `profiles` y `vehicles` con `NOT VALID`, después de normalizar lo que se pueda. **No:** `CHECK` validado sobre todas las filas, ni poner en NULL los valores que no se puedan normalizar. Así la migración nunca falla por un dato viejo raro y no se pierde información; las filas viejas inválidas se corrigen la próxima vez que el usuario guarde su perfil.
- **Sí:** `CHECK` de nombre laxo (largo y espacios al borde). **No:** replicar en SQL la regla de caracteres por rol. Evita mantener dos regex Unicode en paralelo; la regla fina vive en `lib/validacion.ts`.
- **Sí:** normalizar en SQL con `public.normalizar_telefono()` igual que en TypeScript. **No:** normalizar los datos viejos sólo desde la app. Los perfiles existentes quedan bien sin esperar a que cada usuario guarde.
- **Sí:** el teléfono de los contactos de confianza usa la misma regla. **No:** `CHECK` en `contactos_confianza`. Se pidió la regla compartida, no la restricción en esa tabla.
- **Sí:** patente con formato argentino (viejo y Mercosur) y `CHECK` en `vehicles`. **No:** dejar la patente como texto libre. Es el dato que el pasajero usa para reconocer el auto.
- **Sí:** en `/perfil/editar`, nombre y apellido en un solo campo validado con `validarNombreCompleto` (misma regla de caracteres, 2 a 81). **No:** partirlo en dos campos. El perfil guarda el nombre completo en una sola columna y no hay forma confiable de separar los ya guardados.
- **Sí:** marca y color de una lista cerrada en un `<select>`. **No:** texto libre. Es el dato con el que el pasajero reconoce el auto; texto libre deja pasar cualquier cosa. Pedido del usuario después de aprobar el spec.
- **Sí:** "Modelo" es el nombre del auto (Corolla). **No:** usarlo como año. Marca y modelo son datos distintos.
- **No:** pedir el año del vehículo. Se agregó y se sacó en la misma implementación: el pasajero reconoce el auto por marca, modelo, color y patente, y nada en la app usa el año. Si hace falta una antigüedad máxima, va en otro spec.
- **No:** `CHECK` con las listas de marcas y colores. Duplicar listas en SQL obliga a una migración por cada marca nueva.
- **Sí:** el email sólo se valida en registro, login y recuperación. **No:** editar el email desde el perfil. El email vive en `auth.users`, no en `profiles`, y cambiarlo requiere confirmación por mail: va en otro spec.
- **Sí:** devolver `valores` en el estado de la acción para precargar los inputs. **No:** convertir los formularios a inputs controlados. Es el cambio mínimo para que el reset automático de React 19 no borre lo escrito.
- **Sí:** número 19. **No:** 18. Decisión del usuario; el 18 queda reservado.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La regla del `15` (paso 5 de la normalización) quita un `15` que en realidad era parte del número. | Sólo se aplica cuando quedan 12 dígitos, que no es un número válido sin quitar algo. Si el resultado es incorrecto, el usuario lo ve en su perfil y lo corrige. |
| Un perfil viejo con un teléfono que no se puede normalizar queda fuera del `CHECK` y, al guardar el perfil, el formulario se lo rechaza. | Es lo buscado: el error aparece debajo de "Teléfono" con el ejemplo del formato. El `NOT VALID` evita que la migración falle. |
| La regex de nombre de persona rechaza nombres reales con caracteres poco comunes (`ç`, `ã`, letras de otros alfabetos). | Usar clases Unicode (`\p{L}` con flag `u`) en vez de una lista de letras. |
| Las funciones de TypeScript y la función SQL de normalización se desincronizan. | La función SQL se usa sólo en la migración para datos viejos; los datos nuevos los normaliza siempre la app. Los ejemplos del spec sirven de prueba para ambas. |
| El borde rojo y el mensaje debajo de cada campo empujan el botón de enviar fuera de la pantalla en celulares chicos. | Mensajes de una línea, `text-[13px]`; los formularios ya tienen scroll. |
| `user_metadata.telefono` de usuarios que se registraron antes queda en el formato viejo. | `/perfil/editar` sólo lo usa como sugerencia cuando `profiles.telefono` es NULL; al guardar se normaliza. |

## Lo que **no** entra en este spec

- Cambio de email desde el perfil.
- Verificación de identidad (DNI, licencia, documentación del vehículo).
- Verificación del teléfono por código.
- Formato de teléfono para mostrar en pantalla.
- Teléfonos extranjeros y patentes de moto.
- Unicidad de patente o teléfono.
- Reglas nuevas de contraseña.
- Validación en pagos y reclamos.

Cada uno de esos, si aterriza, va en su propio spec.
