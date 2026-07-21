-- SPEC 04 — Solicitud de viaje y estimación de tarifa
-- Idempotente: seguro de re-ejecutar (no duplica ni borra datos).

-- Estado de la solicitud de viaje. En este spec sólo se usan 'pendiente' y
-- 'cancelada'; el Spec 05 ampliará el enum con alter type.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'trip_status') then
    create type public.trip_status as enum ('pendiente', 'cancelada');
  end if;
end$$;

-- Una fila por solicitud de viaje del pasajero.
create table if not exists public.trips (
  id               uuid              primary key default gen_random_uuid(),
  pasajero_id      uuid              not null references public.profiles (id) on delete cascade,
  origen_lat       double precision  not null,
  origen_lng       double precision  not null,
  origen_label     text              not null,
  destino_lat      double precision  not null,
  destino_lng      double precision  not null,
  destino_label    text              not null,
  distancia_m      integer           not null,  -- metros, según OSRM
  duracion_s       integer           not null,  -- segundos, según OSRM
  tarifa_estimada  integer           not null,  -- pesos, entero
  estado           public.trip_status not null default 'pendiente',
  created_at       timestamptz       not null default now()
);

alter table public.trips enable row level security;

-- Policies: drop-if-exists + create => sin duplicados y con la definición correcta.
drop policy if exists "El pasajero ve sus viajes" on public.trips;
create policy "El pasajero ve sus viajes"
  on public.trips for select
  using ( auth.uid() = pasajero_id );

drop policy if exists "El pasajero crea sus viajes" on public.trips;
create policy "El pasajero crea sus viajes"
  on public.trips for insert
  with check ( auth.uid() = pasajero_id );

drop policy if exists "El pasajero actualiza sus viajes" on public.trips;
create policy "El pasajero actualiza sus viajes"
  on public.trips for update
  using ( auth.uid() = pasajero_id );

-- Encuentra rápido la solicitud activa del pasajero.
create index if not exists trips_pasajero_estado_idx
  on public.trips (pasajero_id, estado);
