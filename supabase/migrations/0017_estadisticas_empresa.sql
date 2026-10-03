-- SPEC 17 — Estadísticas de la remisería
-- Viajes y recaudado por período (hoy / semana / mes), en total y por conductor.
-- Sólo funciones nuevas: no toca tablas. Idempotente (create or replace).
-- Aplicar a mano desde el SQL Editor del dashboard de Supabase.
--
-- Un viaje es de la remisería si su asiento en pagos tiene destinatario_id = la
-- remisería (queda fijo al finalizar, Spec 10). Así, quitar a un conductor de la
-- flota no borra lo que la remisería ya cobró por sus viajes.

-- ============================================================================
-- 1) rango_periodo: 'hoy' | 'semana' | 'mes' -> días locales de Argentina
-- ============================================================================
-- Ambos extremos inclusive; hasta = hoy. La semana empieza el lunes (ISO).
create or replace function public.rango_periodo(p_periodo text)
returns table (desde date, hasta date)
language plpgsql
stable
set search_path = public
as $$
declare
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  case p_periodo
    when 'hoy'    then desde := v_hoy;
    when 'semana' then desde := date_trunc('week',  v_hoy)::date;
    when 'mes'    then desde := date_trunc('month', v_hoy)::date;
    else raise exception 'período inválido: %', p_periodo;
  end case;
  hasta := v_hoy;
  return next;
end;
$$;

-- ============================================================================
-- 2) empresa_estadisticas_conductores: una fila por conductor
-- ============================================================================
-- La flota actual (aunque no tenga viajes) más los ex conductores con viajes
-- cobrados por la remisería en el período. facturado/comision/recaudado suman
-- los pagos 'pagado' (facturado = recaudado + comision); pendiente_cobro, el
-- monto de los 'pendiente' (efectivo sin confirmar). viajes cuenta ambos.
create or replace function public.empresa_estadisticas_conductores(p_periodo text)
returns table (
  id              uuid,
  nombre          text,
  email           text,
  en_flota        boolean,
  viajes          integer,
  facturado       integer,
  comision        integer,
  recaudado       integer,
  pendiente_cobro integer
)
language plpgsql
stable
security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if (select pr.role from public.profiles pr where pr.id = auth.uid())
     is distinct from 'empresa' then
    raise exception 'sólo una empresa puede ver estas estadísticas';
  end if;

  return query
  with r as (select * from public.rango_periodo(p_periodo)),
  v as (
    select t.conductor_id, pg.monto, pg.comision, pg.neto, pg.estado
      from public.pagos pg
      join public.trips t on t.id = pg.trip_id
      cross join r
     where pg.destinatario_id = auth.uid()
       and t.estado = 'finalizada'
       and (t.cerrado_at at time zone 'America/Argentina/Buenos_Aires')::date
           between r.desde and r.hasta
  ),
  c as (
    select p.id as conductor_id from public.profiles p where p.empresa_id = auth.uid()
    union
    select v.conductor_id from v
  )
  select c.conductor_id,
         p.nombre,
         u.email::text,
         coalesce(p.empresa_id = auth.uid(), false),
         count(v.conductor_id)::integer,
         coalesce(sum(v.monto)    filter (where v.estado = 'pagado'),    0)::integer,
         coalesce(sum(v.comision) filter (where v.estado = 'pagado'),    0)::integer,
         coalesce(sum(v.neto)     filter (where v.estado = 'pagado'),    0)::integer,
         coalesce(sum(v.monto)    filter (where v.estado = 'pendiente'), 0)::integer
    from c
    join public.profiles p on p.id = c.conductor_id
    join auth.users u      on u.id = c.conductor_id
    left join v            on v.conductor_id = c.conductor_id
   group by c.conductor_id, p.nombre, u.email, p.empresa_id
   order by 4 desc, 5 desc, p.nombre;
end;
$$;

-- ============================================================================
-- 3) empresa_resumen: los totales del período
-- ============================================================================
-- Agrega sobre empresa_estadisticas_conductores: hereda su control de rol y el
-- total coincide siempre con la suma de las filas. conductores_con_viajes cuenta
-- sólo la flota actual (es "N de los M de tu flota"); los viajes y la plata de
-- los ex conductores sí suman en los totales.
create or replace function public.empresa_resumen(p_periodo text)
returns table (
  desde                  date,
  hasta                  date,
  viajes                 integer,
  conductores_con_viajes integer,
  conductores_flota      integer,
  facturado              integer,
  comision               integer,
  recaudado              integer,
  pendiente_cobro        integer
)
language sql
stable
security definer set search_path = public
as $$
  select r.desde, r.hasta,
         coalesce(sum(e.viajes), 0)::integer,
         (count(*) filter (where e.viajes > 0 and e.en_flota))::integer,
         (count(*) filter (where e.en_flota))::integer,
         coalesce(sum(e.facturado), 0)::integer,
         coalesce(sum(e.comision), 0)::integer,
         coalesce(sum(e.recaudado), 0)::integer,
         coalesce(sum(e.pendiente_cobro), 0)::integer
    from public.rango_periodo(p_periodo) r
    left join public.empresa_estadisticas_conductores(p_periodo) e on true
   group by r.desde, r.hasta;
$$;
