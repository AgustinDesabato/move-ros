-- ============================================================================
-- Cambio de display — Desglose de recaudación por conductor en /empresa
-- ============================================================================
-- empresa_conductores ahora devuelve, además del neto de la remisería
-- (recaudado_hoy), el total facturado del día (suma de monto = tarifa) y la
-- comisión de plataforma (suma de comision). Las tres cifras se calculan sobre
-- los pagos 'pagado', así que se cumple: facturado_hoy = recaudado_hoy + comision_hoy.
--
-- finalizadas_hoy sigue contando TODOS los viajes finalizados del día (aunque un
-- efectivo sin confirmar no sume plata). Corte de día local de Argentina, como antes.
--
-- Cambia el returns table -> drop + create. Idempotente.
-- Aplicar a mano desde el SQL Editor del dashboard de Supabase.
-- ============================================================================

drop function if exists public.empresa_conductores();

create function public.empresa_conductores()
returns table (
  id              uuid,
  nombre          text,
  email           text,
  finalizadas_hoy integer,
  facturado_hoy   integer,
  comision_hoy    integer,
  recaudado_hoy   integer
)
language sql
security definer set search_path = public
as $$
  select c.id, c.nombre, u.email,
         count(t.id)::integer                    as finalizadas_hoy,
         coalesce(sum(pg.monto), 0)::integer     as facturado_hoy,
         coalesce(sum(pg.comision), 0)::integer  as comision_hoy,
         coalesce(sum(pg.neto), 0)::integer      as recaudado_hoy
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
