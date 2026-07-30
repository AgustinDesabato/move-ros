-- SPEC 10 — Pagos del viaje (registro y comisión)
-- Idempotente: seguro de re-ejecutar (no duplica ni borra datos).

-- ============================================================================
-- 1) Enums nuevos
-- ============================================================================
-- Método elegido por el pasajero al solicitar.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'metodo_pago') then
    create type public.metodo_pago as enum ('efectivo', 'digital');
  end if;
end$$;

-- Estado del asiento de pago. 'pendiente' = efectivo sin confirmar; 'pagado' =
-- efectivo confirmado por el conductor o digital (simulado) liquidado al finalizar.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'pago_estado') then
    create type public.pago_estado as enum ('pendiente', 'pagado');
  end if;
end$$;

-- ============================================================================
-- 2) Método de pago en trips
-- ============================================================================
-- Método que el pasajero eligió al solicitar. default 'efectivo' cubre viajes
-- previos a esta migración sin romper. El asiento de pago (tabla pagos) se crea
-- recién al finalizar; esta columna sólo guarda la elección.
alter table public.trips
  add column if not exists metodo_pago public.metodo_pago not null default 'efectivo';

-- ============================================================================
-- 3) Tabla pagos
-- ============================================================================
-- Una fila = el pago de un viaje. El trip_id unique garantiza un solo asiento.
create table if not exists public.pagos (
  id              uuid primary key default gen_random_uuid(),
  trip_id         uuid not null unique references public.trips(id) on delete cascade,
  destinatario_id uuid not null references public.profiles(id) on delete cascade,
  monto           integer not null,  -- lo que paga el pasajero (= trips.tarifa_estimada)
  comision        integer not null,  -- comisión de plataforma (COMISION_PLATAFORMA)
  neto            integer not null,  -- monto - comision (lo que recibe el destinatario)
  estado          public.pago_estado not null,
  created_at      timestamptz not null default now(),
  pagado_at       timestamptz         -- instante en que quedó 'pagado' (null si pendiente)
);

create index if not exists pagos_destinatario_idx on public.pagos (destinatario_id);

alter table public.pagos enable row level security;

-- Leer: el pasajero o el conductor del viaje, o la empresa dueña del conductor.
-- Nadie escribe directo: registrar_pago / confirmar_cobro son security definer.
drop policy if exists pagos_select on public.pagos;
create policy pagos_select on public.pagos
  for select using (
    destinatario_id = auth.uid()  -- conductor independiente o empresa destinataria
    or exists (
      select 1 from public.trips t
      where t.id = pagos.trip_id
        and (t.pasajero_id = auth.uid() or t.conductor_id = auth.uid())
    )
  );

-- ============================================================================
-- 4) RPC registrar_pago: crea el asiento al finalizar
-- ============================================================================
-- La llama el conductor al finalizar. Resuelve destinatario y estado; el monto
-- lo lee del viaje (no confía en un monto de parámetro). Idempotente por el unique.
create or replace function public.registrar_pago(
  p_trip_id  uuid,
  p_comision integer,
  p_neto     integer
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_trip   public.trips;
  v_emp    uuid;
  v_dest   uuid;
  v_estado public.pago_estado;
begin
  select * into v_trip from public.trips where id = p_trip_id;
  if v_trip.id is null or v_trip.estado <> 'finalizada'
     or v_trip.conductor_id <> auth.uid() then
    raise exception 'viaje inexistente, no finalizado, o no sos el conductor';
  end if;

  -- destinatario: la empresa del conductor si pertenece a una, si no el conductor
  select empresa_id into v_emp from public.profiles where id = v_trip.conductor_id;
  v_dest := coalesce(v_emp, v_trip.conductor_id);

  -- digital: pagado (simulado) al instante; efectivo: pendiente hasta confirmar
  v_estado := case v_trip.metodo_pago when 'digital' then 'pagado' else 'pendiente' end;

  insert into public.pagos (trip_id, destinatario_id, monto, comision, neto, estado, pagado_at)
  values (
    p_trip_id, v_dest, v_trip.tarifa_estimada, p_comision, p_neto, v_estado,
    case when v_estado = 'pagado' then now() else null end
  )
  on conflict (trip_id) do nothing;
end;
$$;

-- ============================================================================
-- 5) RPC confirmar_cobro: el conductor confirma el efectivo
-- ============================================================================
create or replace function public.confirmar_cobro(p_trip_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.pagos p
     set estado = 'pagado', pagado_at = now()
    from public.trips t
   where p.trip_id = p_trip_id
     and t.id = p.trip_id
     and t.conductor_id = auth.uid()
     and p.estado = 'pendiente';
end;
$$;

-- ============================================================================
-- 6) empresa_conductores recreada: recaudado_hoy (neto pagado) en vez de suma_tarifas
-- ============================================================================
-- Parte del cuerpo del Spec 09 (finalizadas_hoy + corte de día local de Argentina)
-- y reemplaza suma(tarifa_estimada) por suma(neto) de los pagos 'pagado'. Cambia el
-- nombre de una columna del returns -> drop + create.
drop function if exists public.empresa_conductores();

create function public.empresa_conductores()
returns table (
  id              uuid,
  nombre          text,
  email           text,
  finalizadas_hoy integer,
  recaudado_hoy   integer
)
language sql
security definer set search_path = public
as $$
  select c.id, c.nombre, u.email,
         count(t.id)::integer                    as finalizadas_hoy,
         coalesce(sum(pg.neto), 0)::integer       as recaudado_hoy
    from public.profiles c
    join auth.users u on u.id = c.id
    left join public.trips t
      on t.conductor_id = c.id
     and t.estado = 'finalizada'
     and (t.cerrado_at at time zone 'America/Argentina/Buenos_Aires')::date
       = (now()        at time zone 'America/Argentina/Buenos_Aires')::date
    left join public.pagos pg
      on pg.trip_id = t.id
     and pg.estado = 'pagado'
   where c.empresa_id = auth.uid()
   group by c.id, c.nombre, u.email
   order by c.nombre;
$$;

-- ============================================================================
-- 7) historial_viajes recreada: suma el detalle de pago
-- ============================================================================
-- Parte del cuerpo del Spec 08 (contraparte + ya_calificado) y agrega el método,
-- estado y neto del pago (null si el viaje no tiene pago, ej. cancelada).
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
  ya_calificado   boolean,
  metodo_pago     public.metodo_pago,
  pago_estado     public.pago_estado,
  pago_neto       integer
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
                 where c.trip_id = t.id and c.autor_id = auth.uid()) as ya_calificado,
         t.metodo_pago,
         pg.estado as pago_estado,
         pg.neto   as pago_neto
  from public.trips t
  left join public.profiles cp on cp.id = t.conductor_id
  left join public.profiles pp on pp.id = t.pasajero_id
  left join public.pagos pg on pg.trip_id = t.id
  where (t.pasajero_id = auth.uid() or t.conductor_id = auth.uid())
    and t.estado in ('finalizada', 'cancelada')
  order by coalesce(t.cerrado_at, t.created_at) desc
  limit 50;
$$;
