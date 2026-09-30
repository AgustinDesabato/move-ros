-- SPEC 13 — Reclamos
-- Idempotente: seguro de re-ejecutar (no duplica ni borra datos).

-- Reclamos de cualquier usuario, ligados o no a un viaje puntual. Cada usuario
-- lee y crea sólo los suyos; sin update/delete (resolver un reclamo es una
-- capa de gestión que no está definida todavía, ver Spec 13).
create table if not exists public.reclamos (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references public.profiles(id) on delete cascade,
  trip_id     uuid references public.trips(id) on delete set null,
  motivo      text not null,
  descripcion text not null,
  estado      text not null default 'abierto' check (estado in ('abierto', 'resuelto')),
  created_at  timestamptz not null default now()
);

create index if not exists reclamos_usuario_idx on public.reclamos (usuario_id);
create index if not exists reclamos_trip_idx    on public.reclamos (trip_id);

alter table public.reclamos enable row level security;

drop policy if exists "El usuario ve sus reclamos" on public.reclamos;
create policy "El usuario ve sus reclamos"
  on public.reclamos for select
  using (auth.uid() = usuario_id);

-- El trip_id es opcional; si viene, tiene que ser un viaje propio (como
-- pasajero o como conductor) — no se puede reclamar sobre un viaje ajeno.
drop policy if exists "El usuario crea sus reclamos" on public.reclamos;
create policy "El usuario crea sus reclamos"
  on public.reclamos for insert
  with check (
    auth.uid() = usuario_id
    and (
      trip_id is null
      or exists (
        select 1 from public.trips t
         where t.id = trip_id
           and (t.pasajero_id = auth.uid() or t.conductor_id = auth.uid())
      )
    )
  );
