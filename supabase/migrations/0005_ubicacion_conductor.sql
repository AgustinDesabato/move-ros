-- SPEC 06 — Seguimiento de ubicación en vivo del conductor
-- Idempotente: seguro de re-ejecutar (no duplica ni borra datos).

-- ============================================================================
-- 1) Columnas de ubicación en profiles
-- ============================================================================
-- Última posición conocida del conductor. null = no está compartiendo ubicación
-- (ocioso, o viaje ya cerrado). Se considera vigente si ubic_at > now() - 30s.
alter table public.profiles
  add column if not exists ubic_lat double precision,
  add column if not exists ubic_lng double precision,
  add column if not exists ubic_at  timestamptz;

-- La escritura de la posición es un self-update de profiles cubierto por la policy
-- de update del Spec 01/02 (auth.uid() = id); no requiere policy ni RPC nueva.

-- ============================================================================
-- 2) datos_conductor: ahora también devuelve la ubicación del conductor
-- ============================================================================
-- Cambia el tipo de retorno: drop + create (create or replace no permite alterar
-- la firma de la tabla devuelta). Sigue siendo security definer y sólo devuelve
-- datos al pasajero dueño del viaje.
drop function if exists public.datos_conductor(uuid);

create function public.datos_conductor(p_trip_id uuid)
returns table (
  nombre   text,
  marca    text,
  modelo   text,
  patente  text,
  color    text,
  ubic_lat double precision,
  ubic_lng double precision,
  ubic_at  timestamptz
)
language sql
security definer set search_path = public
as $$
  select p.nombre, v.marca, v.modelo, v.patente, v.color,
         p.ubic_lat, p.ubic_lng, p.ubic_at
  from public.trips t
  join public.profiles p on p.id = t.conductor_id
  join public.vehicles v on v.conductor_id = t.conductor_id
  where t.id = p_trip_id
    and t.pasajero_id = auth.uid()
    and t.conductor_id is not null;
$$;

-- ============================================================================
-- 3) Limpieza de la ubicación al cerrar / soltar el viaje
-- ============================================================================
-- Al finalizar, bajarse o cancelar, el conductor deja de compartir su ubicación:
-- se borran las columnas ubic_* para que no quede un punto "colgado" entre viajes.

-- finalizar_viaje: en_curso -> finalizada. El conductor es auth.uid().
create or replace function public.finalizar_viaje(p_trip_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_ok boolean;
begin
  update public.trips
    set estado = 'finalizada'
    where id = p_trip_id and conductor_id = auth.uid() and estado = 'en_curso'
    returning true into v_ok;
  if v_ok is null then
    return;
  end if;

  -- Deja de compartir la ubicación al cerrar el viaje.
  update public.profiles
    set ubic_lat = null, ubic_lng = null, ubic_at = null
    where id = auth.uid();
end;
$$;

-- bajarse_viaje: aceptada -> pendiente, se excluye y re-despacha. Conductor = auth.uid().
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

  -- El conductor que se baja deja de compartir su ubicación.
  update public.profiles
    set ubic_lat = null, ubic_lng = null, ubic_at = null
    where id = auth.uid();

  perform public.despachar_viaje(p_trip_id);
end;
$$;

-- cancelar_viaje: el pasajero cancela pendiente/aceptada. Limpia la ubicación del
-- conductor asignado (si lo hubiera), capturándolo del viaje antes de perderlo.
create or replace function public.cancelar_viaje(p_trip_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_conductor uuid;
begin
  update public.trips
    set estado = 'cancelada'
    where id = p_trip_id and pasajero_id = auth.uid()
      and estado in ('pendiente', 'aceptada')
    returning conductor_id into v_conductor;
  if not found then
    return;
  end if;

  update public.trip_offers
    set estado = 'vencida'
    where trip_id = p_trip_id and estado = 'ofrecida';

  -- Si había conductor asignado (viaje aceptada), corta su compartir de ubicación.
  if v_conductor is not null then
    update public.profiles
      set ubic_lat = null, ubic_lng = null, ubic_at = null
      where id = v_conductor;
  end if;
end;
$$;
