# SPEC 11 — Consentimiento del conductor (invitación a la remisería)

> **Estado:** aprobado
> **Depende de:** SPEC 01, SPEC 02, SPEC 09
> **Fecha:** 2026-07-31
> **Objetivo:** Reemplazar el alta directa de conductores del Spec 09 por un flujo de consentimiento —la empresa **invita** a un conductor por email (invitación `pendiente`), el conductor la **acepta o rechaza** desde `/perfil`, y sólo al **aceptar** se setea `profiles.empresa_id`—, permitiendo varias invitaciones pendientes en simultáneo, autocancelando el resto al aceptar una, respetando (grandfather) los vínculos ya existentes, y dejando fuera el “salir por cuenta propia” y las notificaciones.

Este spec cierra el hueco de seguridad que el Spec 09 dejó explícito: hoy `agregar_conductor` setea `profiles.empresa_id` **sin que el conductor intervenga** —cualquier empresa puede reclamar a cualquier conductor sabiendo su email—, y sólo se mitiga con “no robar de otra empresa” + el botón Quitar. Acá el alta pasa **siempre** por consentimiento: la empresa manda una **invitación** (nueva tabla `invitaciones`, estado `pendiente`), el conductor la ve en `/perfil` y la **acepta o rechaza**, y recién al aceptar se establece el vínculo. Se elimina la RPC `agregar_conductor` para que no quede ningún camino que saltee el consentimiento. Deliberadamente **no** se toca el despacho, la tarifa ni los pagos (Spec 10): un conductor invitado que acepta queda exactamente como un conductor vinculado hoy.

## Alcance

**Incluye:**

- Migración SQL `supabase/migrations/0011_invitaciones.sql` (idempotente):
  - Enum nuevo `invitacion_estado` (`pendiente`, `aceptada`, `rechazada`, `cancelada`).
  - Tabla nueva `public.invitaciones`: una fila por invitación de una empresa a un conductor, con `estado`, `created_at` y `resuelta_at`. Índice único **parcial** sobre `(empresa_id, conductor_id) where estado = 'pendiente'` → a lo sumo **una** invitación pendiente por par (pero se permite reinvitar tras un rechazo: nueva fila).
  - RLS en `invitaciones`: la empresa emisora y el conductor invitado pueden **leer** sus filas; nadie escribe directo (todo va por RPC `security definer`).
  - RPC `invitar_conductor(p_email)` (`security definer`, **reemplaza** a `agregar_conductor`): valida que quien llama sea `empresa`, busca al conductor por email, rechaza si no existe / no es conductor / es uno mismo / ya pertenece a una empresa / ya tiene una invitación pendiente de esta empresa; inserta la invitación `pendiente`.
  - RPC `aceptar_invitacion(p_invitacion_id)` (`security definer`): valida que quien llama sea el conductor invitado, que la invitación esté `pendiente` y que el conductor **siga libre** (`empresa_id` null); setea `profiles.empresa_id`, marca la invitación `aceptada`, y **autocancela** el resto de las invitaciones pendientes de ese conductor.
  - RPC `rechazar_invitacion(p_invitacion_id)` (`security definer`): el conductor invitado marca una invitación `pendiente` como `rechazada`.
  - RPC `cancelar_invitacion(p_invitacion_id)` (`security definer`): la empresa emisora marca su invitación `pendiente` como `cancelada`.
  - RPC `empresa_invitaciones()` (`security definer`): las invitaciones **pendientes** que mandó la empresa que llama, cada una con `nombre` y `email` del conductor.
  - RPC `mis_invitaciones()` (`security definer`): las invitaciones **pendientes** que recibió el conductor que llama, cada una con el `nombre` de la empresa.
  - **Se elimina** (`drop function`) la RPC `agregar_conductor` del Spec 09. `quitar_conductor`, `empresa_conductores` y `empresa_viajes_conductor` quedan **intactas**.
- **Tipos TypeScript** (`lib/supabase/types.ts`, extendido): `InvitacionEstado`; `InvitacionPendiente` (fila de `empresa_invitaciones`, como la ve la empresa); `MiInvitacion` (fila de `mis_invitaciones`, como la ve el conductor).
- **Server Actions de empresa** (`app/actions/empresa.ts`, editado): `agregarConductor` → **`invitarConductor(email)`** (RPC `invitar_conductor`); nuevas `getInvitaciones()` (RPC `empresa_invitaciones`) y `cancelarInvitacion(id)` (RPC `cancelar_invitacion`). `quitarConductor`, `getConductores`, `getViajesConductor` quedan igual.
- **Server Actions del conductor** (`app/actions/invitaciones.ts`, nuevo): `getMisInvitaciones()` (RPC `mis_invitaciones`), `aceptarInvitacion(id)` y `rechazarInvitacion(id)`.
- **UI de `/empresa`** (`app/empresa/page.tsx` + `app/empresa/gestion-conductores.tsx`): el botón “Agregar” pasa a **“Invitar”**; nueva sección **“Invitaciones pendientes”** (email del conductor + botón “Cancelar”), separada de la lista de conductores vinculados. Al aceptar el conductor, “sube” de esa sección a la lista de conductores.
- **UI de `/perfil`** (`app/perfil/page.tsx` + `app/perfil/invitaciones-conductor.tsx`, nuevo): sólo para el rol `conductor`, una sección **“Invitaciones de remiserías”** que lista las pendientes (nombre de la empresa) con botones **“Aceptar”** / **“Rechazar”**. Si el conductor **ya pertenece** a una empresa, una línea read-only **“Tu remisería: X”** (sin acción de salir — ver fuera de alcance).

**Fuera de alcance (para specs futuros):**

- **Salir por cuenta propia** de la remisería: el conductor no puede desvincularse solo (hoy sólo la empresa lo quita con `quitar_conductor`, que se mantiene). Va en su propio spec.
- **Notificaciones** (push / email / in-app en tiempo real) al conductor cuando lo invitan: la invitación se ve al abrir `/perfil`, como la vista estática del Spec 09. Sin polling.
- **Re-consentir vínculos existentes:** los conductores ya vinculados por el Spec 09 quedan como están (**grandfather**); no se les pide aceptar retroactivamente.
- **Historial de invitaciones** para el usuario: ni la empresa ni el conductor ven las `rechazada`/`cancelada`/`aceptada` pasadas; sólo se listan las `pendiente` (las resueltas quedan en la tabla para auditoría, no en la UI).
- **Caducidad / expiración** de una invitación pendiente (a diferencia de las ofertas de viaje del Spec 05, que sí vencen): una invitación pendiente no expira sola; se resuelve por aceptar / rechazar / cancelar.
- **Reglas de reinvitación** más allá de “se puede”: sin cooldown ni límite de reintentos tras un rechazo.
- **Despacho, tarifa y pagos:** un conductor que acepta queda idéntico a un conductor vinculado hoy; no se toca `despachar_viaje`, `lib/tarifa.ts` ni el Spec 10.

## Modelo de datos

Migración `supabase/migrations/0011_invitaciones.sql`. Idempotente (segura de re-ejecutar). Se aplica a mano desde el SQL Editor del dashboard (el proyecto no tiene CLI vinculado), como las anteriores.

### Enum nuevo

```sql
-- Estado de una invitación de una empresa a un conductor.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'invitacion_estado') then
    create type public.invitacion_estado as enum
      ('pendiente', 'aceptada', 'rechazada', 'cancelada');
  end if;
end$$;
```

### Tabla nueva `invitaciones`

Una fila = una invitación. El índice único **parcial** garantiza a lo sumo una invitación `pendiente` por par (empresa, conductor), pero deja convivir filas resueltas (`rechazada`/`cancelada`/`aceptada`), de modo que reinvitar tras un rechazo inserta una fila nueva y el historial queda para auditoría.

```sql
create table if not exists public.invitaciones (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references public.profiles(id) on delete cascade,
  conductor_id uuid not null references public.profiles(id) on delete cascade,
  estado       public.invitacion_estado not null default 'pendiente',
  created_at   timestamptz not null default now(),
  resuelta_at  timestamptz   -- instante en que dejó de estar 'pendiente' (null si sigue pendiente)
);

-- A lo sumo UNA invitación pendiente por par empresa↔conductor. Las filas
-- resueltas no cuentan, así que se puede reinvitar tras un rechazo/cancelación.
create unique index if not exists invitaciones_pendiente_unica_idx
  on public.invitaciones (empresa_id, conductor_id)
  where estado = 'pendiente';

-- Búsquedas del conductor ("mis invitaciones") y de la empresa ("las que mandé").
create index if not exists invitaciones_conductor_idx on public.invitaciones (conductor_id);
create index if not exists invitaciones_empresa_idx   on public.invitaciones (empresa_id);
```

Convención: `empresa_id` apunta a una fila `role='empresa'` y `conductor_id` a una `role='conductor'`. La **pertenencia** sigue siendo `profiles.empresa_id` (Spec 09); esta tabla es sólo el **flujo de consentimiento**. `resuelta_at` se setea cuando `estado` pasa de `pendiente` a cualquier otro. `on delete cascade` limpia las invitaciones si se borra la empresa o el conductor.

### RLS de `invitaciones`

Nadie escribe directo (todo va por RPC `security definer`). El select se abre a las dos partes de la invitación:

```sql
alter table public.invitaciones enable row level security;

-- Leer: la empresa emisora o el conductor invitado.
create policy invitaciones_select on public.invitaciones
  for select using (
    empresa_id = auth.uid() or conductor_id = auth.uid()
  );
```

*(No hay policies de insert/update: las RPC de abajo son `security definer` y validan la pertenencia, igual que `agregar_conductor`/`calificar_viaje` en specs previos.)*

### RPC `invitar_conductor(p_email)` — reemplaza a `agregar_conductor`

`security definer`. La empresa invita a un conductor ya registrado por su email. Mismas validaciones que el viejo `agregar_conductor`, pero en vez de setear `empresa_id`, inserta una invitación `pendiente`.

```sql
create or replace function public.invitar_conductor(p_email text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid  uuid;
  v_role public.user_role;
  v_emp  uuid;
begin
  if (select role from public.profiles where id = auth.uid()) <> 'empresa' then
    raise exception 'sólo una empresa puede invitar conductores';
  end if;

  select id into v_uid from auth.users where lower(email) = lower(trim(p_email));
  if v_uid is null then
    raise exception 'no existe un usuario con ese email';
  end if;
  if v_uid = auth.uid() then
    raise exception 'no podés invitarte a vos mismo';
  end if;

  select role, empresa_id into v_role, v_emp
    from public.profiles where id = v_uid;
  if v_role <> 'conductor' then
    raise exception 'ese usuario no es un conductor';
  end if;
  if v_emp is not null then
    raise exception 'el conductor ya pertenece a una empresa';
  end if;

  -- una sola invitación pendiente por par (lo garantiza el índice parcial;
  -- este chequeo da un mensaje claro en vez del error de constraint)
  if exists (
    select 1 from public.invitaciones
     where empresa_id = auth.uid() and conductor_id = v_uid and estado = 'pendiente'
  ) then
    raise exception 'ya tenés una invitación pendiente para ese conductor';
  end if;

  insert into public.invitaciones (empresa_id, conductor_id)
  values (auth.uid(), v_uid);
end;
$$;

-- El alta directa sin consentimiento del Spec 09 deja de existir.
drop function if exists public.agregar_conductor(text);
```

### RPC `aceptar_invitacion(p_invitacion_id)`

`security definer`. El conductor acepta: se vincula y se **autocancelan** sus demás pendientes.

```sql
create or replace function public.aceptar_invitacion(p_invitacion_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_empresa uuid;
begin
  -- la invitación tiene que ser mía (conductor), estar pendiente, y yo seguir libre
  select empresa_id into v_empresa
    from public.invitaciones
   where id = p_invitacion_id
     and conductor_id = auth.uid()
     and estado = 'pendiente';
  if v_empresa is null then
    raise exception 'invitación inexistente, no pendiente, o no es tuya';
  end if;
  if (select empresa_id from public.profiles where id = auth.uid()) is not null then
    raise exception 'ya pertenecés a una empresa';
  end if;

  -- vincular
  update public.profiles set empresa_id = v_empresa where id = auth.uid();

  -- marcar esta como aceptada
  update public.invitaciones
     set estado = 'aceptada', resuelta_at = now()
   where id = p_invitacion_id;

  -- autocancelar el resto de mis pendientes (de otras empresas)
  update public.invitaciones
     set estado = 'cancelada', resuelta_at = now()
   where conductor_id = auth.uid() and estado = 'pendiente';
end;
$$;
```

### RPC `rechazar_invitacion(p_invitacion_id)`

`security definer`. El conductor rechaza una de sus invitaciones pendientes.

```sql
create or replace function public.rechazar_invitacion(p_invitacion_id uuid)
returns void
language sql
security definer set search_path = public
as $$
  update public.invitaciones
     set estado = 'rechazada', resuelta_at = now()
   where id = p_invitacion_id
     and conductor_id = auth.uid()
     and estado = 'pendiente';
$$;
```

### RPC `cancelar_invitacion(p_invitacion_id)`

`security definer`. La empresa cancela una invitación pendiente que mandó.

```sql
create or replace function public.cancelar_invitacion(p_invitacion_id uuid)
returns void
language sql
security definer set search_path = public
as $$
  update public.invitaciones
     set estado = 'cancelada', resuelta_at = now()
   where id = p_invitacion_id
     and empresa_id = auth.uid()
     and estado = 'pendiente';
$$;
```

### RPC `empresa_invitaciones()`

`security definer`. Las invitaciones **pendientes** que mandó la empresa que llama, con datos del conductor invitado.

```sql
create or replace function public.empresa_invitaciones()
returns table (
  id           uuid,
  conductor_id uuid,
  nombre       text,
  email        text,
  created_at   timestamptz
)
language sql
security definer set search_path = public
as $$
  select i.id, i.conductor_id, c.nombre, u.email, i.created_at
    from public.invitaciones i
    join public.profiles  c on c.id = i.conductor_id
    join auth.users       u on u.id = i.conductor_id
   where i.empresa_id = auth.uid()
     and i.estado = 'pendiente'
   order by i.created_at desc;
$$;
```

### RPC `mis_invitaciones()`

`security definer`. Las invitaciones **pendientes** que recibió el conductor que llama, con el nombre de la empresa.

```sql
create or replace function public.mis_invitaciones()
returns table (
  id             uuid,
  empresa_id     uuid,
  empresa_nombre text,
  created_at     timestamptz
)
language sql
security definer set search_path = public
as $$
  select i.id, i.empresa_id, e.nombre, i.created_at
    from public.invitaciones i
    join public.profiles e on e.id = i.empresa_id
   where i.conductor_id = auth.uid()
     and i.estado = 'pendiente'
   order by i.created_at desc;
$$;
```

### Tipos TypeScript (`lib/supabase/types.ts`, extendido)

```ts
export type InvitacionEstado = "pendiente" | "aceptada" | "rechazada" | "cancelada";

// Una fila de empresa_invitaciones(): una invitación pendiente, como la ve la empresa.
export type InvitacionPendiente = {
  id: string;
  conductor_id: string;
  nombre: string | null;
  email: string;
  created_at: string;
};

// Una fila de mis_invitaciones(): una invitación pendiente, como la ve el conductor.
export type MiInvitacion = {
  id: string;
  empresa_id: string;
  empresa_nombre: string | null;
  created_at: string;
};
```

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Migración.** Escribir y ejecutar `supabase/migrations/0011_invitaciones.sql`: enum `invitacion_estado`, tabla `invitaciones` + índice único parcial + índices + RLS de select, las RPC `invitar_conductor`, `aceptar_invitacion`, `rechazar_invitacion`, `cancelar_invitacion`, `empresa_invitaciones`, `mis_invitaciones`, y el `drop function agregar_conductor`. *Verificación (SQL Editor):* como empresa, `invitar_conductor('<email de un conductor libre>')` crea una fila `pendiente`; sobre un email inexistente / un pasajero / uno mismo / un conductor con empresa / un pendiente duplicado tira excepción; `mis_invitaciones()` como ese conductor la lista; `aceptar_invitacion('<id>')` setea `profiles.empresa_id` y marca `aceptada`; con dos pendientes, aceptar una deja la otra `cancelada`; `rechazar_invitacion`/`cancelar_invitacion` mueven el estado correcto; `agregar_conductor` ya no existe.

2. **Tipos.** En `lib/supabase/types.ts`: agregar `InvitacionEstado`, `InvitacionPendiente` y `MiInvitacion`. *Verificación:* `npm run lint` pasa.

3. **Server Actions de empresa.** En `app/actions/empresa.ts`: renombrar `agregarConductor` → `invitarConductor(email)` (RPC `invitar_conductor`, mantiene el `{ error }` legible); agregar `getInvitaciones()` (RPC `empresa_invitaciones`) y `cancelarInvitacion(id)` (RPC `cancelar_invitacion`), ambas con `revalidatePath("/empresa")`. `quitarConductor`, `getConductores`, `getViajesConductor` quedan igual. *Verificación:* `npm run lint` pasa; llamadas tipadas.

4. **Server Actions del conductor.** Nuevo `app/actions/invitaciones.ts`: `getMisInvitaciones()` (RPC `mis_invitaciones`), `aceptarInvitacion(id)` y `rechazarInvitacion(id)` (con `revalidatePath("/perfil")`). *Verificación:* `npm run lint` pasa.

5. **UI de `/empresa` — invitar + pendientes.** En `app/empresa/gestion-conductores.tsx`: el botón “Agregar” pasa a **“Invitar”** (llama `invitarConductor`, muestra el error si falla, `router.refresh()` al éxito); nueva sección **“Invitaciones pendientes”** (recibida por props desde `page.tsx` vía `getInvitaciones()`) que lista email del conductor + botón **“Cancelar”** (`cancelarInvitacion` + refresh), o un vacío claro. En `app/empresa/page.tsx`: sumar el fetch de `getInvitaciones()` y pasarlo al componente. *Verificación:* invitar por email agrega una fila a “Invitaciones pendientes” (no a la lista de conductores); un email inválido/ajeno muestra el error; “Cancelar” la saca; la lista de conductores vinculados sigue mostrando sólo a los que aceptaron.

6. **UI de `/perfil` — aceptar / rechazar.** Nuevo `app/perfil/invitaciones-conductor.tsx` (client): recibe las `MiInvitacion[]` y, por cada una, nombre de la empresa + botones **“Aceptar”** (`aceptarInvitacion` + refresh) y **“Rechazar”** (`rechazarInvitacion` + refresh); si no hay ninguna, no renderiza nada (o un texto tenue). En `app/perfil/page.tsx`: sólo para el rol `conductor`, hacer `getMisInvitaciones()` y renderizar el componente arriba/junto al `perfil-form`; y la línea read-only **“Tu remisería: X”** si `profile.empresa_id` no es null. *Verificación:* un conductor con una invitación la ve en `/perfil`; “Aceptar” lo vincula (aparece “Tu remisería: X” y desaparece la invitación); “Rechazar” la saca sin vincular; un conductor ya vinculado no ve invitaciones nuevas (no se lo puede invitar).

7. **Prueba end-to-end.** Registrar una empresa y dos conductores libres. Desde `/empresa`, **invitar** a los dos por email → aparecen en “Invitaciones pendientes”, no en la lista de conductores. Con una segunda empresa, invitar **también** a uno de ellos (dos pendientes para el mismo conductor). Como ese conductor, en `/perfil`: ver las dos invitaciones, **aceptar** una → queda vinculado (`empresa_id` seteado, “Tu remisería: X”), la otra invitación **desaparece** (autocancelada) y en la segunda empresa deja de figurar como pendiente. Con el otro conductor, **rechazar** y verificar que no se vincula y que la empresa puede **reinvitarlo**. Confirmar que **quitar** un conductor vinculado (Spec 09) lo devuelve a libre y se lo puede volver a invitar. Confirmar que un conductor **ya vinculado antes de esta migración** (grandfather) sigue en la lista de su empresa sin cambios. Confirmar que la experiencia de pasajero/conductor en el despacho y los pagos **no cambió**. *Verificación:* todos los criterios de aceptación.

## Criterios de aceptación

- [ ] Existe el enum `invitacion_estado` (`pendiente`/`aceptada`/`rechazada`/`cancelada`) y la tabla `public.invitaciones` con RLS activa y policy de select (empresa emisora **o** conductor invitado).
- [ ] Un índice único **parcial** impide dos invitaciones `pendiente` para el mismo par (empresa, conductor); pero tras un `rechazada`/`cancelada` se puede insertar una nueva (reinvitar).
- [ ] La RPC `agregar_conductor` del Spec 09 **ya no existe** (ningún camino setea `empresa_id` sin consentimiento).
- [ ] `invitar_conductor(email)` crea una invitación `pendiente` de la empresa que llama hacia un conductor libre; **no** setea `empresa_id`.
- [ ] `invitar_conductor` tira error legible si: el email no existe, el usuario no es conductor, es uno mismo, el conductor ya pertenece a una empresa, o ya hay una invitación pendiente de esa empresa para ese conductor.
- [ ] `aceptar_invitacion(id)` sólo funciona para el conductor invitado y sobre una invitación `pendiente`: setea `profiles.empresa_id` a la empresa emisora y marca la invitación `aceptada` (con `resuelta_at`).
- [ ] Al aceptar una invitación, **todas** las demás invitaciones `pendiente` de ese conductor pasan a `cancelada`.
- [ ] `aceptar_invitacion` rechaza (excepción) si el conductor **ya pertenece** a una empresa (no puede aceptar dos).
- [ ] `rechazar_invitacion(id)` sólo funciona para el conductor invitado sobre una `pendiente` → `rechazada`; no setea `empresa_id`.
- [ ] `cancelar_invitacion(id)` sólo funciona para la empresa emisora sobre una `pendiente` → `cancelada`.
- [ ] `empresa_invitaciones()` devuelve **sólo** las `pendiente` que mandó la empresa que llama, con `nombre` y `email` del conductor.
- [ ] `mis_invitaciones()` devuelve **sólo** las `pendiente` que recibió el conductor que llama, con el `nombre` de la empresa.
- [ ] Una empresa no ve invitaciones de **otra** empresa, y un conductor no ve invitaciones dirigidas a **otro** conductor (RLS + acotación por `auth.uid()` en las RPC).
- [ ] En `/empresa`, el botón dice **“Invitar”**; hay una sección **“Invitaciones pendientes”** (email + “Cancelar”) separada de la lista de conductores vinculados; un invitado que aún no aceptó **no** aparece en la lista de conductores ni suma métricas.
- [ ] En `/perfil`, un conductor con invitaciones pendientes las ve con el nombre de cada empresa y botones **“Aceptar”**/**“Rechazar”**; al aceptar, la invitación desaparece y aparece **“Tu remisería: X”**; al rechazar, desaparece sin vincular.
- [ ] Un conductor **ya vinculado** (por el Spec 09, antes de esta migración) conserva su `empresa_id` y sigue en la lista de su empresa sin cambios (grandfather).
- [ ] `quitar_conductor` sigue funcionando (la empresa devuelve un conductor a libre) y un conductor devuelto a libre puede ser **invitado de nuevo**.
- [ ] La experiencia de pasajero y conductor **no cambia**: despacho, tarifa y pagos (Spec 10) funcionan igual; un conductor que aceptó queda idéntico a uno vinculado hoy.
- [ ] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** una **tabla `invitaciones`** aparte, con estado propio. **No:** columnas de invitación en `profiles` (`empresa_invita_id` + `invitacion_estado`). La tabla separa el **flujo de consentimiento** del **vínculo** (`profiles.empresa_id`, que Spec 09/10 ya usan como fuente de pertenencia y destinatario de pagos), permite **varias** invitaciones pendientes a la vez (imposible con una columna) y deja historial para auditoría. Columnas en `profiles` pisarían una sola invitación y ensuciarían la fila.
- **Sí:** la **pertenencia sigue siendo `profiles.empresa_id`**, seteada sólo al aceptar. **No:** derivar la pertenencia de la tabla `invitaciones` (la fila `aceptada`). No romper la semántica que ya consumen el despacho, `empresa_conductores` y `registrar_pago` (Spec 10, destinatario = empresa) es más barato y seguro que reescribir todos esos lugares.
- **Sí:** **eliminar `agregar_conductor`**. **No:** dejarla “por compatibilidad”. Mientras exista una RPC que setea `empresa_id` sin consentimiento, el hueco de seguridad sigue abierto; el objetivo del spec es cerrarlo, no duplicarlo.
- **Sí:** **varias invitaciones pendientes** simultáneas a un conductor libre, que él elige. **No:** una sola pendiente que bloquee a las demás. Bloquear le daría a la primera empresa un “lock” sobre el conductor; permitir varias respeta que el conductor decida entre ofertas.
- **Sí:** al **aceptar**, **autocancelar** el resto de las pendientes del conductor. **No:** dejarlas `pendiente` pero inaccionables. Un conductor ya vinculado no puede aceptar otra; mostrárselas sería ruido y dejaría el estado incoherente. Cancelarlas mantiene limpias las listas de ambas partes.
- **Sí:** índice único **parcial** `where estado = 'pendiente'`. **No:** único sobre `(empresa_id, conductor_id)` a secas. El parcial garantiza “una sola pendiente por par” **y** habilita reinvitar tras un rechazo (fila nueva); un único total impediría el segundo intento y obligaría a reciclar filas resueltas, perdiendo historial.
- **Sí:** la empresa puede **reinvitar** tras un rechazo. **No:** que un rechazo bloquee futuras invitaciones. Un rechazo suele ser un “ahora no”; un bloqueo permanente necesitaría además un mecanismo para levantarlo, superficie que esta capa no justifica.
- **Sí:** listar **sólo `pendiente`** en `mis_invitaciones`/`empresa_invitaciones`. **No:** mostrar el historial (`rechazada`/`cancelada`/`aceptada`) en la UI. Las resueltas quedan en la tabla para auditoría, pero en pantalla sólo importa lo accionable; un historial visible es un spec de reporting aparte.
- **Sí:** el conductor ve/acciona las invitaciones en **`/perfil`**. **No:** en `/conducir` ni en una ruta nueva. `/perfil` es su página de cuenta; Spec 09 dejó `/conducir` limpio para el despacho, y una ruta dedicada es más ceremonia de la necesaria para esta capa.
- **Sí:** una línea read-only **“Tu remisería: X”** en `/perfil`. **No:** un botón de “salir” ahí mismo. La transparencia (saber a qué empresa pertenece, tras haber aceptado) va con el espíritu del consentimiento; **salir por cuenta propia** es una acción con sus propias reglas y va en su spec.
- **Sí:** **grandfather** de los vínculos existentes del Spec 09. **No:** resetear `empresa_id` y pedir re-consentimiento. Resetear es destructivo y desconectaría flotas ya armadas; el spec cierra el alta **futura**, sin castigar los datos existentes.
- **Sí:** una invitación pendiente **no expira** sola. **No:** copiar el vencimiento de las ofertas de viaje (Spec 05). Una oferta de viaje es urgente (segundos); una invitación a una flota no tiene esa presión, y la empresa siempre puede **cancelar**. La caducidad automática es superficie extra sin necesidad clara.
- **Sí:** el destinatario y todas las validaciones se **infieren de `auth.uid()`** dentro de RPC `security definer`. **No:** policies de insert/update sobre `invitaciones`. Es el patrón que ya usan `calificar_viaje` (Spec 08) y las RPC del Spec 09/10; concentra la validación en un solo lugar y evita abrir escritura directa a la tabla.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| **Deploy desacoplado de la migración:** si el front nuevo (que llama `invitar_conductor`/`mis_invitaciones`/…) sale antes de aplicar `0011`, o si se aplica el `drop function agregar_conductor` antes de mergear el front, el alta de conductores queda rota entre medio. | Se aplica la migración **antes** de mergear el front, como en todos los specs anteriores (el proyecto aplica el SQL a mano y después mergea). El `drop` de `agregar_conductor` y el nuevo `invitar_conductor` van en el **mismo** script, así que no hay ventana con las dos ausentes. |
| **Carrera al aceptar dos invitaciones:** un conductor con dos pendientes podría disparar `aceptar_invitacion` de ambas casi a la vez y terminar “vinculado” a dos empresas o con estado incoherente. | `aceptar_invitacion` revalida `profiles.empresa_id is null` **dentro** de la función antes de vincular; el segundo `accept` encuentra `empresa_id` ya seteado y tira “ya pertenecés a una empresa”. El `update ... where estado='pendiente'` de la autocancelación es idempotente. |
| Las RPC `security definer` leen/escriben datos de otros usuarios (`auth.users`, `profiles`, `invitaciones`): un bug en el `where` expondría emails/invitaciones de otra empresa o dejaría a un tercero aceptar/cancelar invitaciones ajenas. | Cada RPC acota por `auth.uid()` (la empresa emisora en invitar/cancelar/empresa_invitaciones; el conductor invitado en aceptar/rechazar/mis_invitaciones) y valida el `estado` antes de escribir. La RLS de select cubre `empresa_id = auth.uid() or conductor_id = auth.uid()`. Se verifica en el paso end-to-end que una empresa no ve ni toca invitaciones de otra. |
| **Reinvitaciones repetidas como acoso:** sin cooldown ni límite, una empresa podría invitar → (rechazo) → reinvitar en loop, llenando el `/perfil` del conductor. | Aceptado en esta capa: el conductor siempre puede **rechazar**, y una invitación pendiente por par está topeada a una (índice parcial), así que no se acumulan duplicados simultáneos. Cooldown/límite de reintentos es una regla de un spec futuro (marcado en “fuera de alcance”). |
| **Conductor sin consentimiento real, sólo diferido:** la empresa sigue pudiendo `quitar_conductor` sin avisar, y un conductor grandfathered nunca aceptó nada. | El spec cierra puntualmente el **alta futura sin consentimiento** (el hueco que el roadmap marcó). Quitar es gestión de roster (no expone datos ajenos) y el grandfather es una decisión explícita para no romper datos; “salir por cuenta propia” y el consentimiento retroactivo son specs aparte. |
| El conductor **no se entera** de una invitación hasta que abre `/perfil` (sin notificaciones): una invitación podría quedar pendiente indefinidamente. | Es el alcance elegido (notificaciones fuera). La invitación no expira y la empresa la ve como “pendiente”, así que nada se pierde; el canal de aviso (push/email) es un spec propio. |

## Lo que **no** entra en este spec

- Salir por cuenta propia de la remisería (el conductor desvinculándose solo); hoy sólo la empresa lo quita con `quitar_conductor`.
- Notificaciones (push / email / in-app en tiempo real) al conductor cuando lo invitan.
- Re-consentir retroactivamente los vínculos ya existentes del Spec 09 (grandfather).
- Historial de invitaciones resueltas en la UI (sólo se listan las pendientes).
- Caducidad / expiración automática de una invitación pendiente.
- Cooldown o límite de reintentos de reinvitación tras un rechazo.
- Despacho de flota, tarifa propia y pagos (Spec 10): no se tocan.

Cada uno de esos, si aterriza, va en su propio spec (el más inmediato del roadmap es **“salir por cuenta propia”**, complemento natural de este consentimiento).
