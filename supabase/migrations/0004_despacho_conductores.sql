-- SPEC 05 — Despacho de viajes a conductores
-- Idempotente: seguro de re-ejecutar (no duplica ni borra datos).

-- ============================================================================
-- 1) Ampliación del enum trip_status
-- ============================================================================
-- 'add value if not exists' es idempotente. El valor nuevo no puede USARSE en
-- la misma transacción que lo crea; por eso más abajo creamos las funciones con
-- check_function_bodies = off (no se valida el cuerpo al crearlas, y los valores
-- ya están commiteados cuando las funciones se ejecutan por RPC).
alter type public.trip_status add value if not exists 'aceptada';
alter type public.trip_status add value if not exists 'en_curso';
alter type public.trip_status add value if not exists 'finalizada';

-- ============================================================================
-- 2) Enum offer_status + tabla trip_offers
-- ============================================================================
do $$ begin
  if not exists (select 1 from pg_type where typname = 'offer_status') then
    create type public.offer_status as enum ('ofrecida', 'aceptada', 'rechazada', 'vencida');
  end if;
end$$;

-- Una fila por oferta hecha a un conductor para un viaje.
create table if not exists public.trip_offers (
  id            uuid                primary key default gen_random_uuid(),
  trip_id       uuid                not null references public.trips (id)    on delete cascade,
  conductor_id  uuid                not null references public.profiles (id) on delete cascade,
  estado        public.offer_status not null default 'ofrecida',
  expira_at     timestamptz         not null,   -- created_at + 20s
  created_at    timestamptz         not null default now()
);

-- Oferta activa por viaje (a lo sumo una 'ofrecida' vigente) y exclusión de candidatos.
create index if not exists trip_offers_trip_estado_idx on public.trip_offers (trip_id, estado);
create index if not exists trip_offers_conductor_estado_idx on public.trip_offers (conductor_id, estado);

-- Helpers para las policies cruzadas trips <-> trip_offers. Son security definer:
-- consultan la OTRA tabla sin volver a disparar su RLS, evitando la recursión
-- infinita que se produce si una policy referencia directamente a la otra tabla.
create or replace function public.es_pasajero_del_viaje(p_trip_id uuid)
returns boolean
language sql
security definer stable set search_path = public
as $$
  select exists (
    select 1 from public.trips t
    where t.id = p_trip_id and t.pasajero_id = auth.uid()
  );
$$;

create or replace function public.conductor_con_oferta(p_trip_id uuid)
returns boolean
language sql
security definer stable set search_path = public
as $$
  select exists (
    select 1 from public.trip_offers o
    where o.trip_id = p_trip_id and o.conductor_id = auth.uid()
  );
$$;

alter table public.trip_offers enable row level security;

-- El conductor ve sólo sus ofertas; las escrituras van por funciones security definer.
drop policy if exists "El conductor ve sus ofertas" on public.trip_offers;
create policy "El conductor ve sus ofertas"
  on public.trip_offers for select
  using ( auth.uid() = conductor_id );

drop policy if exists "El pasajero ve las ofertas de sus viajes" on public.trip_offers;
create policy "El pasajero ve las ofertas de sus viajes"
  on public.trip_offers for select
  using ( public.es_pasajero_del_viaje(trip_offers.trip_id) );

-- ============================================================================
-- 3) Columnas nuevas en tablas existentes
-- ============================================================================
-- Conductor asignado al viaje (null hasta que alguien acepta).
alter table public.trips
  add column if not exists conductor_id uuid references public.profiles (id);

-- Presencia del conductor: el heartbeat del poll de /conducir la actualiza.
alter table public.profiles
  add column if not exists last_seen_at timestamptz;

-- Encuentra rápido los viajes de un conductor (candidatos ocupados, datos del viaje).
create index if not exists trips_conductor_estado_idx on public.trips (conductor_id, estado);

-- ============================================================================
-- 4) RLS: el conductor ve el viaje que se le ofreció o que tiene asignado
-- ============================================================================
-- (La policy del pasajero del Spec 04 "El pasajero ve sus viajes" se mantiene.)
drop policy if exists "El conductor ve viajes ofrecidos o asignados" on public.trips;
create policy "El conductor ve viajes ofrecidos o asignados"
  on public.trips for select
  using ( auth.uid() = conductor_id
          or public.conductor_con_oferta(trips.id) );

-- ============================================================================
-- 5) Funciones de despacho y transición (security definer, RPC)
-- ============================================================================
-- check_function_bodies = off: no valida el cuerpo al crear la función, así que
-- referenciar los valores de enum recién agregados no rompe en la misma corrida.
set check_function_bodies = off;

-- Motor de despacho. Sobre un viaje pendiente: vence la oferta expirada y, si no
-- hay oferta activa, ofrece al siguiente conductor candidato. Idempotente y seguro
-- de llamar repetidamente (no-op si ya hay una oferta vigente o si no está pendiente).
-- Es un helper interno: no chequea propiedad (sólo mueve ofertas de viajes pendientes).
create or replace function public.despachar_viaje(p_trip_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_estado public.trip_status;
  v_next   uuid;
begin
  -- Serializa despachos concurrentes del mismo viaje (poll del pasajero vs. rechazo).
  select estado into v_estado from public.trips where id = p_trip_id for update;
  if not found or v_estado <> 'pendiente' then
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
  -- y vehículo), activo (last_seen reciente), no excluido de este viaje y no ocupado.
  select p.id into v_next
  from public.profiles p
  join public.vehicles v on v.conductor_id = p.id
  where p.role = 'conductor'
    and p.nombre is not null
    and p.telefono is not null
    and p.last_seen_at > now() - interval '30 seconds'
    -- no excluido: no rechazó ni dejó vencer una oferta de este viaje
    and not exists (
      select 1 from public.trip_offers o
      where o.trip_id = p_trip_id and o.conductor_id = p.id
        and o.estado in ('rechazada', 'vencida')
    )
    -- no ocupado: sin otra oferta vigente
    and not exists (
      select 1 from public.trip_offers o2
      where o2.conductor_id = p.id and o2.estado = 'ofrecida' and o2.expira_at > now()
    )
    -- no ocupado: sin viaje asignado activo
    and not exists (
      select 1 from public.trips t
      where t.conductor_id = p.id and t.estado in ('aceptada', 'en_curso')
    )
  order by p.last_seen_at asc, p.id
  limit 1;

  if v_next is null then
    return;  -- nadie disponible: el viaje sigue pendiente, sin oferta activa
  end if;

  insert into public.trip_offers (trip_id, conductor_id, expira_at)
  values (p_trip_id, v_next, now() + interval '20 seconds');
end;
$$;

-- El conductor acepta la oferta vigente. Condicional: sólo si el viaje sigue
-- pendiente (evita la carrera con la cancelación del pasajero).
create or replace function public.aceptar_oferta(p_trip_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_estado public.trip_status;
begin
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

-- El conductor rechaza su oferta: la marca rechazada y ofrece al siguiente.
create or replace function public.rechazar_oferta(p_trip_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.trip_offers
    set estado = 'rechazada'
    where trip_id = p_trip_id and conductor_id = auth.uid() and estado = 'ofrecida';
  perform public.despachar_viaje(p_trip_id);
end;
$$;

-- El conductor asignado inicia el viaje: aceptada -> en_curso.
create or replace function public.iniciar_viaje(p_trip_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.trips
    set estado = 'en_curso'
    where id = p_trip_id and conductor_id = auth.uid() and estado = 'aceptada';
end;
$$;

-- El conductor asignado finaliza el viaje: en_curso -> finalizada.
create or replace function public.finalizar_viaje(p_trip_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.trips
    set estado = 'finalizada'
    where id = p_trip_id and conductor_id = auth.uid() and estado = 'en_curso';
end;
$$;

-- El conductor se baja de un viaje aceptado: vuelve a pendiente, se excluye a sí
-- mismo (su oferta pasa a rechazada) y se re-despacha al siguiente candidato.
create or replace function public.bajarse_viaje(p_trip_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_ok boolean;
begin
  update public.trips
    set estado = 'pendiente', conductor_id = null
    where id = p_trip_id and conductor_id = auth.uid() and estado = 'aceptada'
    returning true into v_ok;
  if v_ok is null then
    return;
  end if;

  update public.trip_offers
    set estado = 'rechazada'
    where trip_id = p_trip_id and conductor_id = auth.uid()
      and estado in ('aceptada', 'ofrecida');

  perform public.despachar_viaje(p_trip_id);
end;
$$;

-- El pasajero cancela su viaje: pendiente/aceptada -> cancelada. Vence las ofertas
-- activas del viaje. (Extiende la cancelación del Spec 04, que sólo era 'pendiente'.)
create or replace function public.cancelar_viaje(p_trip_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_ok boolean;
begin
  update public.trips
    set estado = 'cancelada'
    where id = p_trip_id and pasajero_id = auth.uid()
      and estado in ('pendiente', 'aceptada')
    returning true into v_ok;
  if v_ok is null then
    return;
  end if;

  update public.trip_offers
    set estado = 'vencida'
    where trip_id = p_trip_id and estado = 'ofrecida';
end;
$$;

-- Datos públicos del conductor asignado, sólo para el pasajero dueño del viaje.
-- Necesaria porque la RLS de profiles/vehicles no deja que el pasajero los lea.
create or replace function public.datos_conductor(p_trip_id uuid)
returns table (nombre text, marca text, modelo text, patente text, color text)
language sql
security definer set search_path = public
as $$
  select p.nombre, v.marca, v.modelo, v.patente, v.color
  from public.trips t
  join public.profiles p on p.id = t.conductor_id
  join public.vehicles v on v.conductor_id = t.conductor_id
  where t.id = p_trip_id
    and t.pasajero_id = auth.uid()
    and t.conductor_id is not null;
$$;

reset check_function_bodies;
