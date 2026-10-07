-- SPEC 26 — Lugares favoritos
-- Idempotente: segura de re-ejecutar (no duplica ni borra datos). No toca
-- ningún enum: se puede pegar y ejecutar entera de una sola vez.

-- Lugares con nombre guardados por el pasajero ("Casa", "Trabajo"). Cada
-- usuario ve, agrega y borra sólo los suyos; no hay edición (agregar/quitar
-- únicamente, igual que contactos_confianza). direccion/lat/lng son la
-- etiqueta y las coordenadas que devolvió el geocoder, el mismo trío que
-- trips guarda como destino_label/destino_lat/destino_lng.
create table if not exists public.lugares_favoritos (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  nombre     text not null,
  direccion  text not null,
  lat        double precision not null,
  lng        double precision not null,
  created_at timestamptz not null default now(),
  constraint lugares_favoritos_nombre_formato
    check (nombre = btrim(nombre) and char_length(nombre) between 2 and 30),
  constraint lugares_favoritos_direccion_no_vacia
    check (btrim(direccion) <> '')
);

-- Un nombre por usuario, sin distinguir mayúsculas. Cubre también el filtro
-- por usuario_id. El tope de 5 lugares no está acá: lo controla
-- agregarFavorito() en app/actions/favoritos.ts.
create unique index if not exists lugares_favoritos_usuario_nombre_idx
  on public.lugares_favoritos (usuario_id, lower(nombre));

alter table public.lugares_favoritos enable row level security;

drop policy if exists "El usuario ve sus lugares" on public.lugares_favoritos;
create policy "El usuario ve sus lugares"
  on public.lugares_favoritos for select
  using (auth.uid() = usuario_id);

drop policy if exists "El usuario agrega sus lugares" on public.lugares_favoritos;
create policy "El usuario agrega sus lugares"
  on public.lugares_favoritos for insert
  with check (auth.uid() = usuario_id);

drop policy if exists "El usuario borra sus lugares" on public.lugares_favoritos;
create policy "El usuario borra sus lugares"
  on public.lugares_favoritos for delete
  using (auth.uid() = usuario_id);
