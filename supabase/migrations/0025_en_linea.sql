-- SPEC 25 — Botón "En línea / Fuera de línea" del conductor
-- Idempotente: segura de re-ejecutar (columna con "if not exists" + create or
-- replace function, sin tocar enums ni otras tablas).

-- ============================================================================
-- 1) Columna profiles.en_linea
-- ============================================================================
-- Default true: un conductor que nunca tocó el switch (o cuya fila ya existía
-- antes de esta migración) sigue comportándose igual que hoy, gateado sólo por
-- el heartbeat. El cambio de comportamiento es opt-in por conductor.
alter table public.profiles
  add column if not exists en_linea boolean not null default true;

-- ============================================================================
-- 2) despachar_viaje: suma la condición en_linea = true al candidato
-- ============================================================================
-- Mismo cuerpo de la 0024 (timeout de 10 minutos incluido), con una condición
-- nueva en la selección de candidato.
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

  -- Timeout del Spec 24: sin cambios.
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
  -- y vehículo), en línea (SPEC 25), activo (last_seen reciente), no excluido de
  -- este viaje y no ocupado.
  select p.id into v_next
  from public.profiles p
  join public.vehicles v on v.conductor_id = p.id
  where p.role = 'conductor'
    and p.nombre is not null
    and p.telefono is not null
    and p.en_linea = true
    and p.last_seen_at > now() - interval '30 seconds'
    and not exists (
      select 1 from public.trip_offers o
      where o.trip_id = p_trip_id and o.conductor_id = p.id
        and o.estado in ('rechazada', 'vencida')
    )
    and not exists (
      select 1 from public.trip_offers o2
      where o2.conductor_id = p.id and o2.estado = 'ofrecida' and o2.expira_at > now()
    )
    and not exists (
      select 1 from public.trips t
      where t.conductor_id = p.id and t.estado in ('aceptada', 'en_curso')
    )
  order by p.last_seen_at asc, p.id
  limit 1;

  if v_next is null then
    return;
  end if;

  insert into public.trip_offers (trip_id, conductor_id, expira_at)
  values (p_trip_id, v_next, now() + interval '20 seconds');
end;
$$;
