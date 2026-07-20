# SPEC 01 — Autenticación y roles con Supabase

> **Estado:** Implementado
> **Depende de:** —
> **Fecha:** 2026-07-20
> **Objetivo:** Permitir que una persona se registre eligiendo un rol único (pasajero o conductor), inicie y cierre sesión con email y contraseña, y sea redirigida a la vista de su rol.

Este es el punto de partida de todo Move Ros: no depende de ningún spec previo y todos los que vienen (perfil, mapa, viajes) dependen de él.

## Alcance

**Incluye:**

- Configuración de los clientes de Supabase con `@supabase/ssr`: uno para navegador (`createBrowserClient`) y uno para servidor (`createServerClient`) en `lib/supabase/`.
- Tabla `profiles` en Supabase (una fila por usuario, con `role`), protegida con RLS, y un trigger que crea la fila automáticamente al registrarse.
- Página de registro (`/registro`) con formulario email + contraseña + selección de rol (pasajero o conductor).
- Página de login (`/login`) con formulario email + contraseña.
- Server Actions para `registrarse`, `iniciarSesion` y `cerrarSesion`.
- Redirección post-login según el rol: pasajero → `/viajar`, conductor → `/conducir`.
- Páginas placeholder `/viajar` y `/conducir`, cada una mostrando el rol y un botón de cerrar sesión.
- Protección de rutas en `proxy.ts`: refresca la sesión de Supabase y redirige al no logueado hacia `/login`.
- Confirmación de email **desactivada** en el proyecto de Supabase (el registro loguea directo).

**Fuera de alcance (para specs futuros):**

- Datos de perfil más allá del rol: nombre, teléfono, datos del vehículo del conductor (spec 02).
- Recuperación / cambio de contraseña.
- Login con proveedores externos (Google, teléfono, magic link).
- Verificación de identidad o de documentación del conductor.
- Cualquier lógica de viajes, mapa, tarifas o matching.
- Permitir que un usuario tenga ambos roles o cambie de rol después del registro.
- Panel de administración o gestión de usuarios.

## Modelo de datos

Este spec introduce una estructura nueva en Supabase: la tabla `profiles` y un tipo enumerado para el rol.

```sql
-- Rol único por usuario
create type public.user_role as enum ('pasajero', 'conductor');

-- Una fila por usuario autenticado
create table public.profiles (
  id         uuid        primary key references auth.users (id) on delete cascade,
  role       public.user_role not null,
  created_at timestamptz not null default now()
);

-- RLS: cada usuario solo ve y edita su propia fila
alter table public.profiles enable row level security;

create policy "Los usuarios ven su propio perfil"
  on public.profiles for select
  using ( auth.uid() = id );

create policy "Los usuarios editan su propio perfil"
  on public.profiles for update
  using ( auth.uid() = id );
```

El rol elegido en el registro viaja como metadata del signup y un trigger crea la fila en `profiles`:

```sql
-- Crea la fila en profiles cuando se registra un usuario,
-- leyendo el rol desde raw_user_meta_data
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, role)
  values (new.id, (new.raw_user_meta_data ->> 'role')::public.user_role);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

Tipo TypeScript que usa la app (en `lib/supabase/types.ts`):

```ts
export type UserRole = "pasajero" | "conductor";

export type Profile = {
  id: string;
  role: UserRole;
  created_at: string;
};
```

**Convenciones:**

- Los valores del enum se guardan en español (`'pasajero'`, `'conductor'`) para que coincidan con `UserRole` en el front y no haga falta traducir.
- No hay política de `insert` para el usuario: la fila la crea el trigger con `security definer`, no el cliente.

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Configurar Supabase (fuera del código) y verificar variables.** En el dashboard de Supabase: desactivar "Confirm email" en Auth → Providers → Email. Confirmar que `.env.local` tiene `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Sin cambios de código todavía.

2. **Aplicar la migración SQL.** Guardar el SQL del modelo de datos en `supabase/migrations/0001_profiles.sql` y ejecutarlo en el SQL Editor de Supabase. Verificación manual: la tabla `profiles`, el enum `user_role`, las policies y el trigger existen en el dashboard.

3. **Crear el cliente de navegador.** `lib/supabase/client.ts` con `createBrowserClient` de `@supabase/ssr` usando las dos env vars. Añadir `lib/supabase/types.ts` con `UserRole` y `Profile`. Verificación: `npm run lint` pasa.

4. **Crear el cliente de servidor.** `lib/supabase/server.ts` con `createServerClient`, leyendo/escribiendo cookies vía `cookies()` de `next/headers` (async en Next 16). Verificación: `npm run build` compila.

5. **Crear el `proxy.ts` de sesión.** Helper `lib/supabase/proxy.ts` que refresca la sesión llamando a `supabase.auth.getUser()` y reescribe las cookies en la respuesta. `proxy.ts` en la raíz lo invoca y, si no hay usuario y la ruta no es `/login` ni `/registro`, redirige a `/login`. Config `matcher` que excluye `_next/static`, `_next/image` y assets. Verificación: navegar a `/viajar` sin sesión redirige a `/login`.

6. **Server Actions de auth.** `app/actions/auth.ts` (`"use server"`) con:
   - `registrarse(prevState, formData)`: valida email/password/rol, llama a `supabase.auth.signUp` pasando `role` en `options.data`, y en éxito `redirect` según rol.
   - `iniciarSesion(prevState, formData)`: `signInWithPassword`, lee el `role` de `profiles`, `redirect` según rol.
   - `cerrarSesion()`: `supabase.auth.signOut()` y `redirect('/login')`.
   Verificación: se pueden importar sin errores de tipo (`npm run build`).

7. **Página de registro.** `app/registro/page.tsx` con un form client component (`useActionState`) que llama a `registrarse`: inputs email, password y un selector de rol (radio pasajero/conductor). Muestra errores de validación. Verificación: registrar un pasajero crea la fila en `profiles` con `role = 'pasajero'` y cae en `/viajar`.

8. **Página de login.** `app/login/page.tsx` con form client component (`useActionState`) que llama a `iniciarSesion`. Muestra error de credenciales inválidas. Verificación: loguear un conductor cae en `/conducir`.

9. **Páginas placeholder por rol.** `app/viajar/page.tsx` y `app/conducir/page.tsx` como Server Components que leen el usuario y su `role`, muestran "Hola, sos pasajero/conductor" y un botón que dispara `cerrarSesion`. Cada página verifica que el rol coincida con la ruta; si no, redirige a la ruta del rol correcto. Verificación: cerrar sesión vuelve a `/login` y `/viajar` deja de ser accesible.

## Criterios de aceptación

- [ ] Existen en Supabase el enum `user_role`, la tabla `profiles`, sus policies de RLS y el trigger `on_auth_user_created`.
- [ ] La confirmación de email está desactivada: al registrarse, el usuario queda logueado sin recibir mail.
- [ ] Registrar un usuario como pasajero crea una fila en `profiles` con `role = 'pasajero'` y redirige a `/viajar`.
- [ ] Registrar un usuario como conductor crea una fila en `profiles` con `role = 'conductor'` y redirige a `/conducir`.
- [ ] Registrarse sin elegir rol, con email inválido o password de menos de 8 caracteres muestra un error y no crea usuario.
- [ ] Registrarse con un email ya usado muestra un error y no crea una segunda cuenta.
- [ ] Loguearse con credenciales correctas redirige al pasajero a `/viajar` y al conductor a `/conducir`.
- [ ] Loguearse con credenciales incorrectas muestra un error y no crea sesión.
- [ ] Entrar a `/viajar` o `/conducir` sin sesión redirige a `/login`.
- [ ] Un pasajero que entra a `/conducir` es redirigido a `/viajar`, y un conductor que entra a `/viajar` es redirigido a `/conducir`.
- [ ] El botón de cerrar sesión en `/viajar` y `/conducir` cierra la sesión y redirige a `/login`.
- [ ] Tras cerrar sesión, volver a `/viajar` redirige a `/login`.
- [ ] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** tabla `profiles` para el rol. Es la forma canónica, sirve de base para el spec 02 y permite consultas/joins.
- **No:** guardar el rol solo en `user_metadata`. Más frágil para autorización.
- **Sí:** el rol lo inserta un trigger `security definer` leyendo `raw_user_meta_data`. Atómico y seguro; el cliente no escribe en `profiles`.
- **Sí:** confirmación de email desactivada en el MVP. Itera más rápido; decisión revisable antes de producción.
- **Sí:** rol único elegido en el registro. Sin doble rol ni cambio de rol (fuera de alcance).
- **Sí:** valores del enum en español (`pasajero`, `conductor`) para que coincidan con `UserRole` en el front.
- **Sí:** protección de rutas en `proxy.ts`. En Next.js 16 el `middleware.ts` está deprecado y renombrado a `proxy`.
- **No:** ruta `/ingresar`. Se mantiene `/login`.
- **No:** política de `delete` en `profiles`. El `on delete cascade` cubre el borrado del usuario de auth.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El trigger falla si el rol no viene o es inválido en el metadata | El form valida el rol antes de `signUp`; el cast al enum falla ruidosamente y aborta el registro. |
| Con la confirmación de email desactivada, cualquiera registra un email sin verificar | Aceptable para el MVP; reactivar antes de producción (queda en decisiones). |
| El chequeo en `proxy.ts` es optimista (solo lee sesión) | Cada página de rol re-verifica el usuario y el rol del lado del servidor; el `proxy` no es la única defensa. |
| La publishable key queda expuesta al navegador | Es por diseño; la RLS de `profiles` es la barrera real de datos. |

## Lo que **no** entra en este spec

- Datos de perfil (nombre, teléfono, vehículo) — spec 02.
- Recuperación / cambio de contraseña.
- Login con proveedores externos (Google, teléfono, magic link).
- Doble rol o cambio de rol.
- Lógica de viajes, mapa, tarifas o matching.

Cada uno de esos, si aterriza, va en su propio spec.
