-- SPEC 12 — Contactos de confianza y alerta de emergencia
-- Idempotente: seguro de re-ejecutar (no duplica ni borra datos).

-- Contactos de confianza del usuario (nombre + teléfono). Cada usuario ve,
-- agrega y borra sólo los suyos; no hay edición (agregar/quitar únicamente).
create table if not exists public.contactos_confianza (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  nombre     text not null,
  telefono   text not null,
  created_at timestamptz not null default now()
);

create index if not exists contactos_confianza_usuario_idx
  on public.contactos_confianza (usuario_id);

alter table public.contactos_confianza enable row level security;

drop policy if exists "El usuario ve sus contactos" on public.contactos_confianza;
create policy "El usuario ve sus contactos"
  on public.contactos_confianza for select
  using (auth.uid() = usuario_id);

drop policy if exists "El usuario agrega sus contactos" on public.contactos_confianza;
create policy "El usuario agrega sus contactos"
  on public.contactos_confianza for insert
  with check (auth.uid() = usuario_id);

drop policy if exists "El usuario borra sus contactos" on public.contactos_confianza;
create policy "El usuario borra sus contactos"
  on public.contactos_confianza for delete
  using (auth.uid() = usuario_id);

-- Registro de alertas de emergencia disparadas durante un viaje. Sólo
-- inserción (sin update/delete): una alerta no se edita ni se borra. La
-- ubicación es nullable: sin fix de GPS (permiso denegado / timeout) la
-- alerta se registra igual, sin coordenadas.
create table if not exists public.alertas_emergencia (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips(id) on delete cascade,
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  ubic_lat   double precision,
  ubic_lng   double precision,
  created_at timestamptz not null default now()
);

create index if not exists alertas_emergencia_usuario_idx on public.alertas_emergencia (usuario_id);
create index if not exists alertas_emergencia_trip_idx    on public.alertas_emergencia (trip_id);

alter table public.alertas_emergencia enable row level security;

drop policy if exists "El usuario ve sus alertas" on public.alertas_emergencia;
create policy "El usuario ve sus alertas"
  on public.alertas_emergencia for select
  using (auth.uid() = usuario_id);

-- Sólo se puede registrar una alerta sobre un viaje propio: el trip_id
-- insertado tiene que ser un viaje donde quien llama es el pasajero.
drop policy if exists "El pasajero registra su alerta" on public.alertas_emergencia;
create policy "El pasajero registra su alerta"
  on public.alertas_emergencia for insert
  with check (
    auth.uid() = usuario_id
    and exists (
      select 1 from public.trips t
       where t.id = trip_id and t.pasajero_id = auth.uid()
    )
  );
