-- ============================================================================
-- SPEC 11 — Consentimiento del conductor (invitación a la remisería)
-- ============================================================================
-- Reemplaza el alta directa del Spec 09 por un flujo de consentimiento: la
-- empresa INVITA a un conductor por email (invitación pendiente), el conductor
-- la acepta o rechaza, y sólo al aceptar se setea profiles.empresa_id. Se elimina
-- agregar_conductor para que no quede ningún camino que saltee el consentimiento.
--
-- Idempotente: segura de re-ejecutar.
-- Aplicar a mano desde el SQL Editor del dashboard de Supabase (el proyecto no
-- tiene CLI vinculado).
-- ============================================================================

-- ============================================================================
-- 1) Enum nuevo
-- ============================================================================
-- Estado de una invitación de una empresa a un conductor.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'invitacion_estado') then
    create type public.invitacion_estado as enum
      ('pendiente', 'aceptada', 'rechazada', 'cancelada');
  end if;
end$$;

-- ============================================================================
-- 2) Tabla nueva invitaciones
-- ============================================================================
-- Una fila = una invitación. La pertenencia sigue siendo profiles.empresa_id
-- (Spec 09); esta tabla es sólo el flujo de consentimiento.
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

-- ============================================================================
-- 3) RLS de invitaciones
-- ============================================================================
-- Nadie escribe directo (todo va por RPC security definer). Leer: la empresa
-- emisora o el conductor invitado.
alter table public.invitaciones enable row level security;

drop policy if exists invitaciones_select on public.invitaciones;
create policy invitaciones_select on public.invitaciones
  for select using (
    empresa_id = auth.uid() or conductor_id = auth.uid()
  );

-- ============================================================================
-- 4) RPC invitar_conductor(p_email) — reemplaza a agregar_conductor
-- ============================================================================
-- La empresa invita a un conductor ya registrado por su email. Mismas
-- validaciones que el viejo agregar_conductor, pero en vez de setear empresa_id,
-- inserta una invitación pendiente.
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

-- ============================================================================
-- 5) RPC aceptar_invitacion(p_invitacion_id)
-- ============================================================================
-- El conductor acepta: se vincula y se autocancelan sus demás pendientes.
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

-- ============================================================================
-- 6) RPC rechazar_invitacion(p_invitacion_id)
-- ============================================================================
-- El conductor rechaza una de sus invitaciones pendientes.
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

-- ============================================================================
-- 7) RPC cancelar_invitacion(p_invitacion_id)
-- ============================================================================
-- La empresa cancela una invitación pendiente que mandó.
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

-- ============================================================================
-- 8) RPC empresa_invitaciones()
-- ============================================================================
-- Las invitaciones pendientes que mandó la empresa que llama, con datos del
-- conductor invitado.
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

-- ============================================================================
-- 9) RPC mis_invitaciones()
-- ============================================================================
-- Las invitaciones pendientes que recibió el conductor que llama, con el nombre
-- de la empresa.
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

-- ============================================================================
-- 10) RPC mi_empresa()
-- ============================================================================
-- El nombre de la remisería a la que pertenece el conductor que llama (null si
-- es independiente). Necesaria porque la RLS de profiles es sólo-lo-tuyo: el
-- conductor no puede leer la fila de su empresa directamente. Alimenta la línea
-- read-only "Tu remisería: X" en /perfil.
create or replace function public.mi_empresa()
returns text
language sql
security definer set search_path = public
as $$
  select e.nombre
    from public.profiles c
    join public.profiles e on e.id = c.empresa_id
   where c.id = auth.uid();
$$;
