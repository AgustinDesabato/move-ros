-- SPEC 35 — Soporte administra usuarios, aprueba conductores y supervisa viajes
-- Idempotente: segura de re-ejecutar (columnas con "if not exists", el update
-- de aprobación sólo corre al crear la columna, triggers/policies con
-- drop-if-exists y funciones con create or replace).

-- ============================================================================
-- 1) Columnas profiles.aprobado y profiles.suspendido
-- ============================================================================
-- aprobado: sólo se lee para conductores. Se agrega con default true para que
-- las filas que ya existen queden aprobadas, y después el default pasa a false
-- para las cuentas nuevas. Sin un update: los CHECK de la 0019 son NOT VALID y
-- un update sobre una fila vieja que no los cumple (p. ej. un teléfono de 9
-- dígitos) haría fallar la migración. Re-ejecutarla no aprueba a nadie: el
-- add column se saltea si la columna ya existe.
alter table public.profiles
  add column if not exists aprobado boolean not null default true;
alter table public.profiles
  alter column aprobado set default false;

alter table public.profiles
  add column if not exists suspendido boolean not null default false;

-- ============================================================================
-- 2) Protección: aprobado y suspendido sólo cambian por las RPC de soporte
-- ============================================================================
-- La policy de update de profiles (Spec 01) deja editar cualquier columna
-- propia. Mismo patrón que proteger_empresa_id() (0030): las RPC security
-- definer corren como el dueño de la función, no como 'authenticated'.
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

-- ============================================================================
-- 3) despachar_viaje: sólo conductores aprobados y no suspendidos
-- ============================================================================
-- Mismo cuerpo de la 0025 (timeout del Spec 24 y en_linea del Spec 25), con
-- dos condiciones nuevas en la selección de candidato.
create or replace function public.despachar_viaje(p_trip_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_estado     public.trip_status;
  v_created_at timestamptz;
  v_next       uuid;
begin
  -- Serializa despachos concurrentes del mismo viaje (poll del pasajero vs. rechazo).
  select estado, created_at into v_estado, v_created_at
    from public.trips where id = p_trip_id for update;
  if not found or v_estado <> 'pendiente' then
    return;
  end if;

  -- Timeout del Spec 24: sin cambios.
  if v_created_at <= now() - interval '10 minutes' then
    update public.trips set estado = 'cancelada' where id = p_trip_id;
    update public.trip_offers
      set estado = 'vencida'
      where trip_id = p_trip_id and estado = 'ofrecida';
    return;
  end if;

  -- Vencer la oferta activa expirada.
  update public.trip_offers
    set estado = 'vencida'
    where trip_id = p_trip_id and estado = 'ofrecida' and expira_at <= now();

  -- ¿Sigue habiendo oferta vigente? Entonces no hay nada que hacer.
  if exists (
    select 1 from public.trip_offers
    where trip_id = p_trip_id and estado = 'ofrecida' and expira_at > now()
  ) then
    return;
  end if;

  -- Elegir el siguiente candidato: conductor con perfil completo (nombre, teléfono
  -- y vehículo), aprobado y no suspendido (SPEC 35), en línea (SPEC 25), activo
  -- (last_seen reciente), no excluido de este viaje y no ocupado.
  select p.id into v_next
  from public.profiles p
  join public.vehicles v on v.conductor_id = p.id
  where p.role = 'conductor'
    and p.nombre is not null
    and p.telefono is not null
    and p.aprobado = true
    and p.suspendido = false
    and p.en_linea = true
    and p.last_seen_at > now() - interval '30 seconds'
    and not exists (
      select 1 from public.trip_offers o
      where o.trip_id = p_trip_id and o.conductor_id = p.id
        and o.estado in ('rechazada', 'vencida')
    )
    and not exists (
      select 1 from public.trip_offers o2
      where o2.conductor_id = p.id and o2.estado = 'ofrecida' and o2.expira_at > now()
    )
    and not exists (
      select 1 from public.trips t
      where t.conductor_id = p.id and t.estado in ('aceptada', 'en_curso')
    )
  order by p.last_seen_at asc, p.id
  limit 1;

  if v_next is null then
    return;
  end if;

  insert into public.trip_offers (trip_id, conductor_id, expira_at)
  values (p_trip_id, v_next, now() + interval '20 seconds');
end;
$$;

-- ============================================================================
-- 4) Un pasajero suspendido no puede pedir viajes
-- ============================================================================
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

-- ============================================================================
-- 5) RPC usuarios_soporte(): todos los usuarios, pendientes de aprobación primero
-- ============================================================================
-- Lectura: devuelve vacío si quien llama no es soporte (mismo criterio que
-- reclamos_soporte() en la 0022).
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

-- ============================================================================
-- 6) RPC aprobar_conductor(p_user_id)
-- ============================================================================
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

-- ============================================================================
-- 7) RPC suspender_usuario(p_user_id, p_suspender): suspende o reactiva
-- ============================================================================
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

  -- Un conductor suspendido con una oferta abierta la pierde: el viaje sigue
  -- pendiente y el próximo despacho se lo ofrece a otro conductor.
  if p_suspender then
    update public.trip_offers
       set estado = 'vencida'
     where conductor_id = p_user_id and estado = 'ofrecida';
  end if;
end;
$$;

-- ============================================================================
-- 8) RPC viajes_soporte(): activos primero, después los últimos 50 cerrados
-- ============================================================================
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

-- ============================================================================
-- 9) aceptar_oferta: un conductor suspendido o sin aprobar no acepta
-- ============================================================================
-- Mismo cuerpo de la 0004, con un chequeo más al principio. Cubre la carrera
-- entre una oferta ya entregada y la suspensión (suspender_usuario además
-- vence la oferta). Igual que el resto de la función, sin excepción: no hace
-- nada y el panel deja de mostrar la oferta en el próximo poll.
create or replace function public.aceptar_oferta(p_trip_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_estado public.trip_status;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and aprobado and not suspendido
  ) then
    return;
  end if;

  if not exists (
    select 1 from public.trip_offers
    where trip_id = p_trip_id and conductor_id = auth.uid()
      and estado = 'ofrecida' and expira_at > now()
  ) then
    return;
  end if;

  select estado into v_estado from public.trips where id = p_trip_id for update;
  if v_estado is distinct from 'pendiente' then
    return;
  end if;

  update public.trips
    set estado = 'aceptada', conductor_id = auth.uid()
    where id = p_trip_id and estado = 'pendiente';

  update public.trip_offers
    set estado = 'aceptada'
    where trip_id = p_trip_id and conductor_id = auth.uid() and estado = 'ofrecida';
end;
$$;
