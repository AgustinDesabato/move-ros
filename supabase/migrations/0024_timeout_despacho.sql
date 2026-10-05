-- SPEC 24 — Timeout del despacho: viaje que nadie acepta se cancela solo
-- Idempotente: es un create or replace function, no toca tablas ni enums.
-- Se puede pegar y ejecutar entera de una sola vez.
--
-- Mismo cuerpo de despachar_viaje() del Spec 05, con un chequeo nuevo al
-- principio: si el viaje sigue pendiente y pasaron 10 minutos o más desde
-- created_at, se cancela (mismo efecto que cancelar_viaje) en vez de
-- intentar ofrecerlo a alguien más.

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

  -- SPEC 24: nadie lo aceptó en 10 minutos → se cancela, igual que cancelar_viaje.
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
