# SPEC 35 — Soporte administra usuarios, aprueba conductores y supervisa viajes

> **Estado:** implementado
> **Depende de:** SPEC 01, SPEC 02, SPEC 05, SPEC 22, SPEC 25
> **Fecha:** 2026-10-08
> **Objetivo:** Que la cuenta `soporte` cumpla el rol de administrador que pide el enunciado: **gestionar usuarios** (verlos y suspenderlos/reactivarlos), **aprobar conductores** (un conductor nuevo no recibe viajes hasta que soporte lo aprueba) y **supervisar viajes** (ver los viajes activos y los últimos cerrados de toda la plataforma).

El Spec 22 creó el rol `soporte` con un único panel (`/soporte`) para reclamos, y el Spec 23 le sumó las alertas de emergencia. Hoy soporte no ve a los usuarios ni a los viajes, y cualquier cuenta que se registra como conductor y completa su perfil empieza a recibir viajes sin que nadie la revise. Este spec agrega dos pestañas nuevas al panel de soporte —**Usuarios** y **Viajes**— y dos columnas a `profiles` (`aprobado`, `suspendido`) que el despacho y la solicitud de viajes respetan.

No se crea un rol `admin` nuevo: el enunciado lo ubica dentro del rol de soporte, y `soporte` ya es la cuenta de confianza que se asigna a mano (Spec 22).

## Alcance

**Incluye:**

- Migración `supabase/migrations/0035_administracion_soporte.sql` (idempotente):
  - `profiles.aprobado boolean not null default false` y `profiles.suspendido boolean not null default false`. Al agregar `aprobado`, los usuarios que **ya existen** quedan aprobados (no se rompe a nadie que hoy maneja); los que se registren después arrancan sin aprobar.
  - Trigger `proteger_estado_cuenta` que impide cambiar `aprobado` o `suspendido` directo desde la API (mismo patrón que `proteger_empresa_id` del Spec 30): sólo cambian por las RPC de soporte.
  - `despachar_viaje` recreada: el candidato además tiene que estar `aprobado = true` y `suspendido = false`.
  - `aceptar_oferta` recreada (cuerpo de la 0004): si quien acepta está suspendido o sin aprobar, no hace nada. Y `suspender_usuario` vence la oferta abierta del conductor que suspende, para que el viaje pase a otro.
  - Policy de insert de `trips` recreada: un pasajero `suspendido` no puede pedir viajes.
  - RPC `security definer`, todas con el chequeo de rol `is distinct from 'soporte'` (Spec 22, migración 0026):
    - `usuarios_soporte()`: todos los usuarios con email, rol, estado y, si es conductor, su vehículo y remisería.
    - `aprobar_conductor(p_user_id)`: pone `aprobado = true`.
    - `suspender_usuario(p_user_id, p_suspender)`: suspende o reactiva una cuenta.
    - `viajes_soporte()`: viajes activos (`pendiente`, `aceptada`, `en_curso`) y los últimos 50 cerrados, con pasajero y conductor.
- **Tipos TypeScript** (`lib/supabase/types.ts`): `Profile` suma `aprobado` y `suspendido`; tipos nuevos `UsuarioSoporte` y `ViajeSoporte`.
- **Server Actions** (`app/actions/soporte.ts`, nuevo): `getUsuariosSoporte()`, `aprobarConductor(formData)`, `suspenderUsuario(formData)`, `getViajesSoporte()`.
- **Panel de soporte con 4 pestañas:** Reclamos · Alertas · **Usuarios** · **Viajes**. El componente `Pestanas`, hoy duplicado en `app/soporte/page.tsx` y `app/soporte/alertas/page.tsx`, se mueve a `app/soporte/pestanas.tsx` y lo usan las cuatro páginas.
- **`/soporte/usuarios`** (nuevo): primero los conductores **pendientes de aprobación** (con nombre, email, teléfono y vehículo) con botón **"Aprobar"**; después todos los usuarios, con rol, fecha de alta y estado (Activo / Suspendido), y botón **"Suspender"** / **"Reactivar"**. Filtro por rol (Todos, Pasajeros, Conductores, Remiserías) con `?rol=` en la URL.
- **`/soporte/viajes`** (nuevo): sólo lectura. Arriba los viajes activos; abajo los últimos 50 cerrados. Cada fila: estado, origen → destino, pasajero, conductor (o "Sin asignar"), tarifa, método de pago y fecha.
- **Conductor sin aprobar** (`app/conducir/page.tsx` + `app/conducir/cuenta-pendiente.tsx`, nuevo): en vez del panel con el switch "En línea" y las ofertas, ve el aviso "Tu cuenta está pendiente de aprobación. Soporte la va a revisar pronto." Es una pantalla aparte para no tocar `panel-conductor.tsx`, que también cambian las Specs 33 y 34.
- **Cuenta suspendida:**
  - `iniciarSesion` (`app/actions/auth.ts`): si el perfil está `suspendido`, cierra la sesión y muestra "Tu cuenta está suspendida. Escribinos para más información." en `/login`.
  - `/viajar`, `/conducir` y `/empresa`: si el perfil está `suspendido` (sesión abierta de antes), redirigen a `/auth/suspendida` (Route Handler nuevo, ruta pública en `lib/supabase/proxy.ts`), que cierra la sesión —un Server Component no puede borrar las cookies durante el render— y redirige a `/login?suspendida=1`, que muestra el mismo aviso. Para leer el parámetro, `app/login/page.tsx` pasa a ser un Server Component y el formulario se mueve a `app/login/login-form.tsx`.
  - `getPerfil` (`lib/perfil.ts`) suma `aprobado` y `suspendido` al `select`.

**Fuera de alcance (para specs futuros):**

- Rol `admin` separado de `soporte`, o niveles de soporte.
- Editar los datos de un usuario (nombre, teléfono, vehículo), cambiarle el rol o eliminar su cuenta.
- Rechazar un conductor con un motivo o pedirle documentación (licencia, seguro, fotos): se aprueba o se deja pendiente; para bloquearlo se lo suspende.
- Revocar una aprobación ya dada (para eso está "Suspender").
- Avisar al usuario (mail, push) cuando lo aprueban o lo suspenden.
- Guardar quién aprobó o suspendió, cuándo, o un motivo.
- Intervenir un viaje desde `/soporte/viajes` (cancelarlo, reasignarlo) o ver su mapa: es sólo lectura y sin mapa.
- Paginación, búsqueda por texto o filtros por fecha en las dos pantallas nuevas.
- Suspender una cuenta de soporte, o la propia.

## Modelo de datos

Migración `supabase/migrations/0035_administracion_soporte.sql`. Idempotente, se aplica a mano desde el SQL Editor, como las anteriores. **El número final de la migración se ajusta al orden de merge** si alguna de las Specs 31–34 suma migraciones antes.

### Columnas nuevas en `profiles`

```sql
-- aprobado: sólo se lee para conductores. Se agrega con default true para que
-- las filas que ya existen queden aprobadas, y después el default pasa a false
-- para las cuentas nuevas. Sin un update: los CHECK de la 0019 son NOT VALID y
-- un update sobre una fila vieja que no los cumple haría fallar la migración.
alter table public.profiles
  add column if not exists aprobado boolean not null default true;
alter table public.profiles
  alter column aprobado set default false;

alter table public.profiles
  add column if not exists suspendido boolean not null default false;
```

### Protección de las columnas

La policy de update de `profiles` (Spec 01) deja editar cualquier columna propia: sin esto, un conductor podría aprobarse solo con un `update` desde el navegador.

```sql
create or replace function public.proteger_estado_cuenta()
returns trigger
language plpgsql
as $$
begin
  if (new.aprobado is distinct from old.aprobado
      or new.suspendido is distinct from old.suspendido)
     and current_user in ('authenticated', 'anon') then
    raise exception 'aprobado y suspendido sólo los cambia soporte';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_estado_cuenta_protegido on public.profiles;
create trigger profiles_estado_cuenta_protegido
  before update on public.profiles
  for each row execute function public.proteger_estado_cuenta();
```

### Despacho y solicitud de viajes

- `despachar_viaje(p_trip_id)`: se recrea con **el mismo cuerpo de la 0025** (timeout del Spec 24 y `en_linea` del Spec 25 incluidos) y dos condiciones más en la selección del candidato: `and p.aprobado = true and p.suspendido = false`.
- Policy de insert de `trips`:

```sql
drop policy if exists "El pasajero crea sus viajes" on public.trips;
create policy "El pasajero crea sus viajes"
  on public.trips for insert
  with check (
    auth.uid() = pasajero_id
    and not exists (
      select 1 from public.profiles
       where id = auth.uid() and suspendido
    )
  );
```

### RPC `usuarios_soporte()`

```sql
create or replace function public.usuarios_soporte()
returns table (
  id          uuid,
  nombre      text,
  email       text,
  telefono    text,
  role        text,
  aprobado    boolean,
  suspendido  boolean,
  empresa     text,     -- nombre de la remisería del conductor, si tiene
  marca       text,
  modelo      text,
  patente     text,
  color       text,
  created_at  timestamptz
)
language sql
security definer set search_path = public
as $$
  select p.id, p.nombre, u.email, p.telefono, p.role::text,
         p.aprobado, p.suspendido, e.nombre,
         v.marca, v.modelo, v.patente, v.color, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.profiles e on e.id = p.empresa_id
    left join public.vehicles v on v.conductor_id = p.id
   where (select role from public.profiles where id = auth.uid()) = 'soporte'
   order by (p.role = 'conductor' and not p.aprobado) desc, p.created_at desc;
$$;
```

Quien no es soporte recibe una lista vacía (lectura, mismo criterio que `reclamos_soporte()`).

### RPC `aprobar_conductor(p_user_id)`

```sql
create or replace function public.aprobar_conductor(p_user_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if (select role from public.profiles where id = auth.uid())
     is distinct from 'soporte' then
    raise exception 'sólo soporte puede aprobar conductores';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and role = 'conductor') then
    raise exception 'el usuario no es conductor';
  end if;
  if not exists (select 1 from public.vehicles where conductor_id = p_user_id) then
    raise exception 'el conductor todavía no cargó su vehículo';
  end if;

  update public.profiles set aprobado = true where id = p_user_id;
end;
$$;
```

### RPC `suspender_usuario(p_user_id, p_suspender)`

```sql
create or replace function public.suspender_usuario(p_user_id uuid, p_suspender boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if (select role from public.profiles where id = auth.uid())
     is distinct from 'soporte' then
    raise exception 'sólo soporte puede suspender usuarios';
  end if;
  if p_user_id = auth.uid()
     or (select role from public.profiles where id = p_user_id) = 'soporte' then
    raise exception 'no se puede suspender una cuenta de soporte';
  end if;
  if p_suspender and exists (
    select 1 from public.trips
     where (pasajero_id = p_user_id or conductor_id = p_user_id)
       and estado in ('pendiente', 'aceptada', 'en_curso')
  ) then
    raise exception 'el usuario tiene un viaje activo';
  end if;

  update public.profiles
     set suspendido = p_suspender,
         en_linea = case when p_suspender then false else en_linea end
   where id = p_user_id;

  if not found then
    raise exception 'usuario inexistente';
  end if;

  -- La oferta abierta del conductor suspendido se vence: el viaje pasa a otro.
  if p_suspender then
    update public.trip_offers
       set estado = 'vencida'
     where conductor_id = p_user_id and estado = 'ofrecida';
  end if;
end;
$$;
```

### RPC `viajes_soporte()`

```sql
create or replace function public.viajes_soporte()
returns table (
  id               uuid,
  estado           text,
  origen_label     text,
  destino_label    text,
  pasajero         text,
  conductor        text,
  tarifa_estimada  integer,   -- pesos, entero (Spec 04)
  metodo_pago      text,
  created_at       timestamptz,
  cerrado_at       timestamptz
)
language sql
security definer set search_path = public
as $$
  (select t.id, t.estado::text, t.origen_label, t.destino_label,
          pp.nombre, pc.nombre, t.tarifa_estimada, t.metodo_pago::text,
          t.created_at, t.cerrado_at
     from public.trips t
     join public.profiles pp on pp.id = t.pasajero_id
     left join public.profiles pc on pc.id = t.conductor_id
    where (select role from public.profiles where id = auth.uid()) = 'soporte'
      and t.estado in ('pendiente', 'aceptada', 'en_curso')
    order by t.created_at desc)
  union all
  (select t.id, t.estado::text, t.origen_label, t.destino_label,
          pp.nombre, pc.nombre, t.tarifa_estimada, t.metodo_pago::text,
          t.created_at, t.cerrado_at
     from public.trips t
     join public.profiles pp on pp.id = t.pasajero_id
     left join public.profiles pc on pc.id = t.conductor_id
    where (select role from public.profiles where id = auth.uid()) = 'soporte'
      and t.estado not in ('pendiente', 'aceptada', 'en_curso')
    order by t.cerrado_at desc nulls last
    limit 50);
$$;
```

### Tipos TypeScript (`lib/supabase/types.ts`, extendido)

```ts
export type Profile = {
  // ...columnas actuales...
  aprobado: boolean;     // sólo aplica a conductores (Spec 35)
  suspendido: boolean;   // cuenta bloqueada por soporte (Spec 35)
};

// Lo que devuelve usuarios_soporte(): sólo para role = 'soporte'.
export type UsuarioSoporte = {
  id: string;
  nombre: string | null;
  email: string;
  telefono: string | null;
  role: UserRole;
  aprobado: boolean;
  suspendido: boolean;
  empresa: string | null;
  marca: string | null;
  modelo: string | null;
  patente: string | null;
  color: string | null;
  created_at: string;
};

// Lo que devuelve viajes_soporte(): activos primero, después los últimos 50 cerrados.
export type ViajeSoporte = {
  id: string;
  estado: TripStatus;
  origen_label: string;
  destino_label: string;
  pasajero: string | null;
  conductor: string | null;
  tarifa_estimada: number;
  metodo_pago: MetodoPago;
  created_at: string;
  cerrado_at: string | null;
};
```

### Server Actions (`app/actions/soporte.ts`, nuevo)

- `getUsuariosSoporte()` y `getViajesSoporte()`: llaman a la RPC y devuelven `[]` si no hay datos.
- `aprobarConductor(prevState, formData)` y `suspenderUsuario(prevState, formData)`: leen `user_id` (y `suspender`), llaman a la RPC, traducen el `message` de la excepción a un texto para la UI ("El usuario tiene un viaje activo.", "El conductor todavía no cargó su vehículo.") y hacen `revalidatePath("/soporte/usuarios")`.

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Commit 1 — este spec.** `specs/35-administracion-soporte.md`.
2. **Migración.** `supabase/migrations/0035_administracion_soporte.sql` con todo lo de "Modelo de datos". Aplicarla en Supabase. *Verificación (SQL Editor):* los conductores existentes tienen `aprobado = true`; un `update profiles set aprobado = true` hecho como usuario común falla; `usuarios_soporte()` y `viajes_soporte()` devuelven vacío sin ser soporte.
3. **Tipos + Server Actions.** `lib/supabase/types.ts`, `app/actions/soporte.ts`, `lib/perfil.ts` (`aprobado`, `suspendido` en el `select`). *Verificación:* `npm run build` compila.
4. **Pestañas + pantallas de soporte.** `app/soporte/pestanas.tsx` (movido), `app/soporte/usuarios/page.tsx` (+ formularios de aprobar y suspender), `app/soporte/viajes/page.tsx`. *Verificación:* `npm run lint` pasa.
5. **Conductor pendiente y cuenta suspendida.** Pantalla `cuenta-pendiente.tsx` en `/conducir`; chequeo en `iniciarSesion`; chequeo en `/viajar`, `/conducir` y `/empresa` con `/auth/suspendida`; aviso en `/login?suspendida=1`.
6. **Prueba end-to-end.** Ver "Caso de prueba".

## Caso de prueba

Precondición: migración aplicada; una cuenta soporte (S), un pasajero (P) y un conductor existente (C1, aprobado por la migración).

| # | Paso | Resultado esperado |
| --- | --- | --- |
| 1 | Registrar un conductor nuevo (C2) y completar su perfil y vehículo. | En `/conducir` ve "Tu cuenta está pendiente de aprobación" y no tiene el switch "En línea". |
| 2 | Como P, pedir un viaje con C2 abierto en `/conducir`. | C2 no recibe la oferta. |
| 3 | Como S, abrir `/soporte/usuarios`. | C2 aparece primero, en "Pendientes de aprobación", con su vehículo. |
| 4 | Tocar "Aprobar" en C2. | C2 pasa a la lista general como Activo; al recargar `/conducir`, C2 ve el switch y puede recibir viajes. |
| 5 | Como S, tocar "Suspender" en P. | P figura "Suspendido". Con la sesión de P abierta, al entrar a `/viajar` se cierra la sesión y ve el aviso de cuenta suspendida. |
| 6 | P intenta iniciar sesión. | Error "Tu cuenta está suspendida…"; no entra. |
| 7 | Como S, tocar "Reactivar" en P. | P vuelve a iniciar sesión y pedir viajes. |
| 8 | Con un viaje de P `en_curso`, S intenta suspender a P o a su conductor. | Error "El usuario tiene un viaje activo."; no se suspende. |
| 9 | Como S, abrir `/soporte/viajes`. | El viaje en curso aparece arriba con pasajero, conductor, tarifa y estado; abajo, los últimos cerrados. |
| 10 | Como P (no soporte), entrar a `/soporte/usuarios` o `/soporte/viajes` por la URL. | Redirige a `/viajar`. |
| 11 | Como C2, desde la consola del navegador, `update` de su `aprobado` o `suspendido`. | La base lo rechaza. |

## Criterios de aceptación

- [ ] Los conductores que existían antes de la migración siguen recibiendo viajes sin hacer nada; los nuevos no reciben viajes hasta que soporte los aprueba.
- [ ] `despachar_viaje` nunca ofrece un viaje a un conductor sin aprobar o suspendido.
- [ ] Un pasajero suspendido no puede pedir viajes, ni por la UI ni insertando en `trips` directo.
- [ ] Una cuenta suspendida no puede iniciar sesión, y una sesión ya abierta se cierra al entrar a su pantalla principal.
- [ ] Ningún usuario puede cambiar su propio `aprobado` o `suspendido`; sólo soporte, por las RPC.
- [ ] `/soporte/usuarios` muestra primero los conductores pendientes con su vehículo, permite aprobarlos, y permite suspender y reactivar a cualquier usuario que no sea soporte y no tenga un viaje activo.
- [ ] `/soporte/viajes` muestra los viajes activos y los últimos 50 cerrados de toda la plataforma, sin acciones.
- [ ] El panel de soporte tiene 4 pestañas (Reclamos, Alertas, Usuarios, Viajes) y las pantallas de reclamos y alertas siguen funcionando igual.
- [ ] Ninguna RPC nueva devuelve datos ni cambia nada si quien llama no es soporte (incluido sin sesión).
- [ ] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** el "administrador" del enunciado es la cuenta `soporte`. **No:** un rol `admin` nuevo. El enunciado lo ubica dentro del rol de soporte, y un rol más obliga a sumar redirecciones y pantallas en toda la app.
- **Sí:** los conductores existentes quedan aprobados por la migración. **No:** dejar a todos pendientes. Romperle el flujo a quien ya está probando o manejando no aporta nada; la aprobación es para los que se registran de ahora en más.
- **Sí:** los existentes quedan aprobados porque la columna se agrega con `default true` y recién después el default pasa a `false`. **No:** un `update` que los apruebe. Los CHECK de la 0019 son `NOT VALID`: un `update` sobre una fila vieja que no los cumple (pasó con un teléfono de 9 dígitos) hace fallar toda la migración; y un `update` suelto, al re-ejecutarla, aprobaría a conductores nuevos pendientes.
- **Sí:** trigger que bloquea `aprobado` y `suspendido` desde la API. **No:** confiar en la UI. La policy de update de `profiles` deja editar cualquier columna propia; es el mismo agujero que cerró el Spec 30 para `empresa_id`.
- **Sí:** no se suspende a alguien con un viaje activo. **No:** suspender y dejar el viaje colgado. Cortar un viaje en curso deja al otro participante sin salida; soporte espera a que termine.
- **Sí:** la suspensión se controla al iniciar sesión y en las tres pantallas principales. **No:** un chequeo en `proxy.ts` en cada request. Agregaría una consulta a `profiles` por request; con las pantallas principales y la policy de `trips` alcanza para que una cuenta suspendida no pueda usar la app.
- **Sí:** `/soporte/viajes` es sólo lectura y sin mapa. **No:** cancelar o reasignar desde ahí. Supervisar es ver; intervenir viajes ajenos necesita reglas nuevas (qué pasa con el pago, quién avisa) que no entran en una semana.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Recrear `despachar_viaje` desde una versión vieja pierde el timeout (Spec 24) o `en_linea` (Spec 25). | Partir del cuerpo de la 0025, como pide el spec; el caso de prueba 2 y el de timeout del Spec 24 se repiten. |
| Un conductor nuevo no entiende por qué no recibe viajes. | El aviso de "pendiente de aprobación" reemplaza al switch en `/conducir`. |
| Nadie revisa los pendientes y un conductor queda esperando. | Los pendientes aparecen primero en `/soporte/usuarios`. Sin notificaciones en el MVP. |
| Soporte suspende a un conductor que ya tiene una oferta en pantalla y la acepta en esos 20 s. | `suspender_usuario` vence la oferta y `aceptar_oferta` rechaza a un suspendido. |
| Otra spec de esta semana también suma una migración y choca el número. | El número de la migración se ajusta al orden de merge (ver "Modelo de datos"). |

## Lo que **no** entra en este spec

- Rol `admin` separado o niveles de soporte.
- Editar datos de usuarios, cambiarles el rol o eliminar cuentas.
- Rechazo con motivo o pedido de documentación al conductor.
- Notificaciones de aprobación o suspensión.
- Historial de quién aprobó o suspendió.
- Cancelar, reasignar o ver en el mapa un viaje desde soporte.
- Paginación, búsqueda o filtros por fecha.

Cada uno de esos, si aterriza, va en su propio spec.
