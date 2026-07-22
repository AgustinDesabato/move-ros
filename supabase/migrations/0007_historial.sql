-- SPEC 07 — Historial de viajes
-- Idempotente: seguro de re-ejecutar (no duplica ni borra datos).

-- ============================================================================
-- 1) Columna de cierre en trips
-- ============================================================================
-- Instante en que el viaje pasó a finalizada o cancelada. null mientras está
-- activo (pendiente/aceptada/en_curso). El historial ordena y fecha por el cierre;
-- created_at (hora de la solicitud) queda como fallback para viajes viejos.
alter table public.trips
  add column if not exists cerrado_at timestamptz;

-- ============================================================================
-- 2) Setear cerrado_at al cerrar el viaje (finalizar / cancelar)
-- ============================================================================
-- Se recrean partiendo del cuerpo del Spec 06 (que limpia ubic_*), sumando
-- cerrado_at = now() del servidor. bajarse_viaje NO se toca: vuelve a pendiente,
-- no cierra el viaje, así que cerrado_at sigue en null.

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
    set estado = 'finalizada', cerrado_at = now()
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

-- cancelar_viaje: el pasajero cancela pendiente/aceptada. Limpia la ubicación del
-- conductor asignado (si lo hubiera) y marca el cierre.
create or replace function public.cancelar_viaje(p_trip_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_conductor uuid;
begin
  update public.trips
    set estado = 'cancelada', cerrado_at = now()
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

-- ============================================================================
-- 3) RPC historial_viajes(): viajes cerrados del usuario, con la contraparte
-- ============================================================================
-- Devuelve los viajes finalizada/cancelada donde el usuario actual es pasajero o
-- conductor, con el NOMBRE de la contraparte (el conductor si mirás como pasajero,
-- el pasajero si mirás como conductor). Es security definer porque cruza a profiles,
-- que la RLS no deja leer del otro rol; se acota al propio usuario con auth.uid() en
-- el where y proyecta sólo el nombre (nunca teléfono/id/otros campos). El limit 50
-- vive acá (fuente de verdad del servidor), no replicado en el cliente.
create or replace function public.historial_viajes()
returns table (
  id              uuid,
  origen_label    text,
  destino_label   text,
  distancia_m     integer,
  tarifa_estimada integer,
  estado          public.trip_status,
  cerrado_at      timestamptz,
  created_at      timestamptz,
  contraparte     text
)
language sql
security definer set search_path = public
as $$
  select t.id, t.origen_label, t.destino_label, t.distancia_m, t.tarifa_estimada,
         t.estado, t.cerrado_at, t.created_at,
         case
           when t.pasajero_id = auth.uid() then cp.nombre   -- miro como pasajero -> conductor
           else pp.nombre                                    -- miro como conductor -> pasajero
         end as contraparte
  from public.trips t
  left join public.profiles cp on cp.id = t.conductor_id
  left join public.profiles pp on pp.id = t.pasajero_id
  where (t.pasajero_id = auth.uid() or t.conductor_id = auth.uid())
    and t.estado in ('finalizada', 'cancelada')
  order by coalesce(t.cerrado_at, t.created_at) desc
  limit 50;
$$;
