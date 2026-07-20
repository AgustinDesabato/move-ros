# SPEC 02 — Perfil de usuario y datos del vehículo

> **Estado:** Implementado
> **Depende de:** SPEC 01
> **Fecha:** 2026-07-20
> **Objetivo:** Permitir que cada usuario complete y edite su perfil (nombre y teléfono para todos; datos del vehículo para conductores), con onboarding obligatorio antes de acceder a la vista de su rol.

Este spec construye sobre la autenticación y los roles del Spec 01: agrega los datos personales que la app va a necesitar en specs posteriores (viajes, matching) y garantiza que estén completos antes de usar la app.

## Alcance

**Incluye:**

- Migración SQL que agrega `nombre` y `telefono` a la tabla `profiles` existente.
- Tabla nueva `vehicles` (1:1 con el conductor) con `marca`, `modelo`, `patente`, `color`, `capacidad`, protegida con RLS.
- Página `/perfil` (Server Component + form) donde el usuario ve y edita su nombre y teléfono; el conductor edita además los datos de su vehículo.
- Server Action `guardarPerfil` que valida y persiste `profiles` y, para conductores, `vehicles` (upsert).
- Onboarding obligatorio: `/viajar` y `/conducir` redirigen a `/perfil` mientras el perfil esté incompleto.
- Definición de "perfil completo": pasajero = `nombre` + `telefono`; conductor = `nombre` + `telefono` + fila en `vehicles` con todos los campos.
- Al completar el perfil incompleto, redirección automática a la vista del rol (`/viajar` o `/conducir`).
- Link a `/perfil` desde `/viajar` y `/conducir`.
- Helper de lectura de perfil (con datos del vehículo si es conductor) reutilizable por las páginas.

**Fuera de alcance (para specs futuros):**

- Foto de perfil / avatar y subida de archivos.
- Documentación del conductor (licencia, seguro, verificación de identidad).
- Validación de patente contra un registro real o formato provincial estricto.
- Verificación del teléfono por SMS/OTP.
- Múltiples vehículos por conductor (por ahora es 1:1).
- Cambiar el rol o tener ambos roles (sigue fuera, como en el Spec 01).
- Cualquier lógica de viajes, mapa, tarifas o matching.

## Modelo de datos

Migración `supabase/migrations/0002_perfil_y_vehiculos.sql`.

Se agregan dos columnas a `profiles`. **Importante:** son **NULL-eables** en la base, aunque `nombre` y `telefono` sean obligatorios a nivel de app. Motivo: el trigger `handle_new_user` del Spec 01 inserta la fila con sólo el `role` al registrarse; si fueran `NOT NULL` sin default, el registro rompería. La obligatoriedad se valida en el form y la Server Action; el perfil "incompleto" es justamente el que tiene estas columnas en NULL.

```sql
-- Datos personales (para ambos roles). Nulos hasta completar el onboarding.
alter table public.profiles
  add column nombre   text,
  add column telefono text;
```

Tabla nueva `vehicles`, 1:1 con el conductor:

```sql
create table public.vehicles (
  conductor_id uuid        primary key references public.profiles (id) on delete cascade,
  marca        text        not null,
  modelo       text        not null,
  patente      text        not null,
  color        text        not null,
  capacidad    smallint    not null check (capacidad between 1 and 10),
  updated_at   timestamptz not null default now()
);

alter table public.vehicles enable row level security;

create policy "El conductor ve su vehículo"
  on public.vehicles for select
  using ( auth.uid() = conductor_id );

create policy "El conductor crea su vehículo"
  on public.vehicles for insert
  with check ( auth.uid() = conductor_id );

create policy "El conductor edita su vehículo"
  on public.vehicles for update
  using ( auth.uid() = conductor_id );
```

Tipos TypeScript (en `lib/supabase/types.ts`, extendiendo lo del Spec 01):

```ts
export type UserRole = "pasajero" | "conductor";

export type Profile = {
  id: string;
  role: UserRole;
  nombre: string | null;
  telefono: string | null;
  created_at: string;
};

export type Vehicle = {
  conductor_id: string;
  marca: string;
  modelo: string;
  patente: string;
  color: string;
  capacidad: number;
  updated_at: string;
};
```

**Convenciones:**

- Las columnas de `vehicles` sí son `NOT NULL`: la fila se crea recién cuando el form pasó la validación con todos los campos.
- `capacidad` es `smallint` con check `1..10`.
- La clave primaria de `vehicles` es `conductor_id` (fuerza el 1:1 con el conductor).
- No hay política de `delete` (borrar cuenta sigue fuera de alcance); el `on delete cascade` limpia el vehículo si se borra el perfil.

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Aplicar la migración.** Guardar y ejecutar `supabase/migrations/0002_perfil_y_vehiculos.sql` (columnas `nombre`/`telefono` en `profiles` + tabla `vehicles` con RLS). Verificación manual: en el dashboard existen las dos columnas nuevas, la tabla `vehicles` y sus tres policies.

2. **Extender los tipos.** Actualizar `lib/supabase/types.ts`: agregar `nombre`/`telefono` a `Profile` y el tipo `Vehicle`. Verificación: `npm run lint` pasa.

3. **Helper de perfil.** Crear `lib/perfil.ts` con:
   - `getPerfil(supabase)`: devuelve el `Profile` del usuario logueado y, si es conductor, su `Vehicle` (o `null`).
   - `perfilCompleto(profile, vehicle)`: `true` si pasajero tiene `nombre`+`telefono`; si conductor, además una fila `vehicles` con todos los campos.
   Verificación: `npm run build` compila.

4. **Server Action `guardarPerfil`.** Crear `app/actions/perfil.ts` (`"use server"`): valida `nombre` (no vacío) y `telefono` (≥8, dígitos/espacios/`+`/`-`); si el usuario es conductor, valida `marca`/`modelo`/`patente`/`color` (no vacíos) y `capacidad` (entero 1–10). Hace `update` de `profiles` y, para conductor, `upsert` de `vehicles`. En éxito, `redirect` a `/viajar` o `/conducir` según el rol. Verificación: compila sin errores de tipo.

5. **Página `/perfil`.** Crear `app/perfil/page.tsx` (Server Component) que lee el perfil con `getPerfil` y renderiza un form client component (`useActionState`) con los valores actuales precargados: `nombre`, `telefono`, y —sólo si es conductor— los campos del vehículo. Muestra errores de validación. Verificación: un conductor ve los campos del vehículo; un pasajero no.

6. **Gate de onboarding + link a `/perfil`.** En `app/viajar/page.tsx` y `app/conducir/page.tsx`: usar `getPerfil` + `perfilCompleto`; si el perfil está incompleto, `redirect("/perfil")`. Agregar un link a `/perfil` en cada vista. Reemplaza la lectura suelta de `profiles` del Spec 01 por el helper `getPerfil` (la guarda por rol se mantiene). Verificación: un usuario recién registrado (perfil vacío) que entra a su rol termina en `/perfil`; tras guardar datos válidos, vuelve a la vista del rol y ya no lo redirige.

## Criterios de aceptación

- [ ] Existen en `profiles` las columnas `nombre` y `telefono` (NULL-eables), y la tabla `vehicles` con sus tres policies de RLS.
- [ ] Un usuario recién registrado (perfil vacío) que entra a `/viajar` o `/conducir` es redirigido a `/perfil`.
- [ ] En `/perfil`, un pasajero ve sólo `nombre` y `telefono`; un conductor ve además `marca`, `modelo`, `patente`, `color` y `capacidad`.
- [ ] Guardar el perfil con `nombre` vacío, `telefono` de menos de 8 caracteres, o (conductor) algún campo del vehículo vacío, muestra un error y no persiste.
- [ ] Guardar con `capacidad` fuera de 1–10 muestra un error y no persiste.
- [ ] Un pasajero que guarda `nombre` + `telefono` válidos queda con el perfil completo y es redirigido a `/viajar`.
- [ ] Un conductor que guarda datos personales + vehículo válidos crea la fila en `vehicles` y es redirigido a `/conducir`.
- [ ] Tras completar el perfil, volver a entrar a la vista del rol ya no redirige a `/perfil`.
- [ ] Reabrir `/perfil` con el perfil ya completo muestra los campos precargados con los valores guardados.
- [ ] Editar un dato y guardar de nuevo actualiza el valor (y, en conductor, hace update de la misma fila de `vehicles`, no crea una segunda).
- [ ] `/viajar` y `/conducir` tienen un link visible a `/perfil`.
- [ ] La guarda por rol del Spec 01 se mantiene: un pasajero en `/conducir` sigue yendo a `/viajar` y viceversa.
- [ ] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** `profiles` + tabla `vehicles` separada. Sólo el conductor tiene auto y el dato probablemente crezca (documentación, seguro) en specs futuros.
- **Sí:** `nombre`/`telefono` NULL-eables en la base. El trigger del Spec 01 inserta sólo `role`; `NOT NULL` sin default rompería el registro. La obligatoriedad se valida en el form y la Server Action.
- **Sí:** `conductor_id` como primary key de `vehicles` (fuerza el 1:1). **No:** columna `id` propia con `unique` — innecesaria para una relación 1:1.
- **Sí:** gate de onboarding en las páginas `/viajar` y `/conducir` (Server Components). **No:** en `proxy.ts` — hace chequeos optimistas y no debe consultar la base.
- **Sí:** `upsert` de `vehicles` en una sola action (crea o actualiza). Simplifica el alta y la edición.
- **Sí:** validación laxa de `telefono` (≥8, dígitos/espacios/`+`/`-`) para el MVP. Revisable.
- **No:** foto de perfil, documentación del conductor, verificación por SMS, múltiples vehículos — cada uno a su propio spec.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Escritura parcial: `update` de `profiles` OK pero `upsert` de `vehicles` falla → perfil inconsistente | Validar **todos** los campos antes de escribir; si el upsert falla se muestra error y el usuario reintenta. `supabase-js` no da transacción atómica cross-statement desde el cliente; aceptable para el MVP. |
| Un pasajero podría insertar una fila en `vehicles` vía API (la RLS sólo valida que el `conductor_id` sea el suyo, no el rol) | El dato huérfano es inocuo y la app nunca lo ofrece. Si hiciera falta, se endurece la policy con un check del rol en un spec futuro. |
| `patente` sin validación de formato → datos basura | Aceptable para el MVP; validación real (formato provincial) queda para otro spec. |

## Lo que **no** entra en este spec

- Foto de perfil / avatar y subida de archivos.
- Documentación del conductor y verificación de identidad.
- Verificación del teléfono por SMS/OTP.
- Múltiples vehículos por conductor.
- Validación estricta de patente.
- Lógica de viajes, mapa, tarifas o matching.

Cada uno de esos, si aterriza, va en su propio spec.
