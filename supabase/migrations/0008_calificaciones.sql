-- ============================================================================
-- SPEC 08 — Calificaciones de conductor y pasajero
-- ============================================================================
-- Al cerrarse un viaje (finalizada), pasajero y conductor pueden calificarse
-- mutuamente con estrellas (1-5) y un comentario opcional. El promedio recibido
-- se expone por RPC (reputacion) al perfil, a la tarjeta del conductor y a la
-- oferta de despacho. El comentario se guarda pero no se muestra todavía.
--
-- Idempotente: segura de re-ejecutar.
-- Aplicar a mano desde el SQL Editor del dashboard de Supabase (el proyecto no
-- tiene CLI vinculado); este archivo es la fuente de verdad versionada.
-- ============================================================================

-- ============================================================================
-- 1) Tabla calificaciones
-- ============================================================================
-- Una fila = una persona calificando a la otra en un viaje. Maximo dos por
-- viaje (una por direccion). El unique (trip_id, autor_id) garantiza que cada
-- quien califica ese viaje una sola vez. Definitiva: no se edita ni se borra.
create table if not exists public.calificaciones (
  id              uuid primary key default gen_random_uuid(),
  trip_id         uuid not null references public.trips(id) on delete cascade,
  autor_id        uuid not null references public.profiles(id) on delete cascade,
  destinatario_id uuid not null references public.profiles(id) on delete cascade,
  estrellas       smallint not null check (estrellas between 1 and 5),
  comentario      text check (comentario is null or char_length(comentario) <= 280),
  created_at      timestamptz not null default now(),
  unique (trip_id, autor_id)
);

create index if not exists calificaciones_destinatario_idx
  on public.calificaciones (destinatario_id);

-- ============================================================================
-- 2) RLS
-- ============================================================================
-- Nadie lee filas ajenas directo: el promedio se sirve agregado por reputacion
-- (security definer). Las policies directas habilitan lo minimo: insertar solo
-- como autor, leer solo lo que di o recibi.
alter table public.calificaciones enable row level security;

drop policy if exists calificaciones_insert on public.calificaciones;
create policy calificaciones_insert on public.calificaciones
  for insert with check (autor_id = auth.uid());

drop policy if exists calificaciones_select on public.calificaciones;
create policy calificaciones_select on public.calificaciones
  for select using (autor_id = auth.uid() or destinatario_id = auth.uid());

-- ============================================================================
-- 3) RPC calificar_viaje
-- ============================================================================
-- Valida que el viaje este finalizada y que quien llama sea el pasajero o el
-- conductor; infiere el destinatario (la contraparte) del propio viaje (no lo
-- recibe por parametro). Idempotente por el unique: si ya califico, no duplica.
create or replace function public.calificar_viaje(
  p_trip_id    uuid,
  p_estrellas  smallint,
  p_comentario text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_trip public.trips;
  v_dest uuid;
begin
  select * into v_trip from public.trips where id = p_trip_id;
  if v_trip.id is null or v_trip.estado <> 'finalizada' then
    raise exception 'viaje inexistente o no finalizado';
  end if;

  -- el autor es quien llama; el destinatario, la contraparte
  if auth.uid() = v_trip.pasajero_id then
    v_dest := v_trip.conductor_id;
  elsif auth.uid() = v_trip.conductor_id then
    v_dest := v_trip.pasajero_id;
  else
    raise exception 'no sos parte de este viaje';
  end if;

  insert into public.calificaciones (trip_id, autor_id, destinatario_id, estrellas, comentario)
  values (p_trip_id, auth.uid(), v_dest, p_estrellas, nullif(trim(p_comentario), ''))
  on conflict (trip_id, autor_id) do nothing;
end;
$$;

-- ============================================================================
-- 4) RPC reputacion
-- ============================================================================
-- Devuelve solo el agregado de estrellas recibidas; nunca comentarios ni quien
-- califico. Con cero calificaciones: promedio null, cantidad 0.
create or replace function public.reputacion(p_user_id uuid)
returns table (promedio numeric, cantidad integer)
language sql
security definer set search_path = public
as $$
  select round(avg(estrellas)::numeric, 1) as promedio,
         count(*)::integer                 as cantidad
    from public.calificaciones
   where destinatario_id = p_user_id;
$$;

-- ============================================================================
-- 5) datos_conductor recreada: suma el promedio del conductor
-- ============================================================================
-- Parte del cuerpo del Spec 06 (nombre + vehiculo + ubicacion + ubic_vigente)
-- y agrega promedio_estrellas / cantidad_calificaciones del conductor asignado.
-- Cambia el returns table -> drop + create.
drop function if exists public.datos_conductor(uuid);

create function public.datos_conductor(p_trip_id uuid)
returns table (
  nombre                  text,
  marca                   text,
  modelo                  text,
  patente                 text,
  color                   text,
  ubic_lat                double precision,
  ubic_lng                double precision,
  ubic_vigente            boolean,
  promedio_estrellas      numeric,
  cantidad_calificaciones integer
)
language sql
security definer set search_path = public
as $$
  select p.nombre, v.marca, v.modelo, v.patente, v.color,
         p.ubic_lat, p.ubic_lng,
         (p.ubic_at is not null
          and p.ubic_at > now() - interval '30 seconds') as ubic_vigente,
         (select round(avg(c.estrellas)::numeric, 1)
            from public.calificaciones c
           where c.destinatario_id = t.conductor_id) as promedio_estrellas,
         (select count(*)::integer
            from public.calificaciones c
           where c.destinatario_id = t.conductor_id) as cantidad_calificaciones
  from public.trips t
  join public.profiles p on p.id = t.conductor_id
  join public.vehicles v on v.conductor_id = t.conductor_id
  where t.id = p_trip_id
    and t.pasajero_id = auth.uid()
    and t.conductor_id is not null;
$$;

-- ============================================================================
-- 6) historial_viajes recreada: suma ya_calificado
-- ============================================================================
-- Parte del cuerpo del Spec 07 (contraparte, orden por cierre, limit 50) y
-- agrega ya_calificado = si el usuario actual ya califico ese viaje.
-- Cambia el returns table -> drop + create.
drop function if exists public.historial_viajes();

create function public.historial_viajes()
returns table (
  id              uuid,
  origen_label    text,
  destino_label   text,
  distancia_m     integer,
  tarifa_estimada integer,
  estado          public.trip_status,
  cerrado_at      timestamptz,
  created_at      timestamptz,
  contraparte     text,
  ya_calificado   boolean
)
language sql
security definer set search_path = public
as $$
  select t.id, t.origen_label, t.destino_label, t.distancia_m, t.tarifa_estimada,
         t.estado, t.cerrado_at, t.created_at,
         case
           when t.pasajero_id = auth.uid() then cp.nombre   -- miro como pasajero -> conductor
           else pp.nombre                                    -- miro como conductor -> pasajero
         end as contraparte,
         exists(select 1 from public.calificaciones c
                 where c.trip_id = t.id and c.autor_id = auth.uid()) as ya_calificado
  from public.trips t
  left join public.profiles cp on cp.id = t.conductor_id
  left join public.profiles pp on pp.id = t.pasajero_id
  where (t.pasajero_id = auth.uid() or t.conductor_id = auth.uid())
    and t.estado in ('finalizada', 'cancelada')
  order by coalesce(t.cerrado_at, t.created_at) desc
  limit 50;
$$;
