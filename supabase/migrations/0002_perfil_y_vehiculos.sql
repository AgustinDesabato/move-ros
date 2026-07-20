-- SPEC 02 — Perfil de usuario y datos del vehículo
-- Idempotente: seguro de re-ejecutar (no duplica ni borra datos).

-- Datos personales (para ambos roles). Nulos hasta completar el onboarding;
-- deben ser NULL-eables para no romper el trigger handle_new_user del Spec 01.
alter table public.profiles add column if not exists nombre   text;
alter table public.profiles add column if not exists telefono text;

-- Vehículo del conductor (1:1). conductor_id es PK => fuerza la relación 1:1.
create table if not exists public.vehicles (
  conductor_id uuid        primary key references public.profiles (id) on delete cascade,
  marca        text        not null,
  modelo       text        not null,
  patente      text        not null,
  color        text        not null,
  capacidad    smallint    not null check (capacidad between 1 and 10),
  updated_at   timestamptz not null default now()
);

alter table public.vehicles enable row level security;

-- Policies: drop-if-exists + create => sin duplicados y con la definición correcta.
drop policy if exists "El conductor ve su vehículo" on public.vehicles;
create policy "El conductor ve su vehículo"
  on public.vehicles for select
  using ( auth.uid() = conductor_id );

drop policy if exists "El conductor crea su vehículo" on public.vehicles;
create policy "El conductor crea su vehículo"
  on public.vehicles for insert
  with check ( auth.uid() = conductor_id );

drop policy if exists "El conductor edita su vehículo" on public.vehicles;
create policy "El conductor edita su vehículo"
  on public.vehicles for update
  using ( auth.uid() = conductor_id );
