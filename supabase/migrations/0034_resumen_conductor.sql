-- SPEC 34 — Resumen del conductor
-- Idempotente: segura de re-ejecutar.
--
-- Sin tablas ni columnas nuevas: una sola RPC que reusa rango_periodo()
-- (Spec 17) para traducir 'hoy' | 'semana' | 'mes' a un rango de días locales
-- de Argentina.

-- RPC conductor_resumen(p_periodo): viajes finalizados y ganado del propio
-- conductor en el período. Cuenta por t.conductor_id (no por pagos.destinatario_id
-- como empresa_resumen): un conductor de una remisería también quiere ver cuánto
-- generaron sus viajes, aunque el pago haya ido a la empresa. Mismo criterio que
-- pago_neto en historial_viajes() (Spec 08/10).
create or replace function public.conductor_resumen(p_periodo text)
returns table (
  desde  date,
  hasta  date,
  viajes integer,
  ganado integer
)
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if (select pr.role from public.profiles pr where pr.id = auth.uid())
     is distinct from 'conductor' then
    raise exception 'sólo un conductor puede ver este resumen';
  end if;

  return query
  select r.desde, r.hasta,
         count(t.id)::integer,
         coalesce(sum(pg.neto) filter (where pg.estado = 'pagado'), 0)::integer
    from public.rango_periodo(p_periodo) r
    left join public.trips t
      on t.conductor_id = auth.uid()
     and t.estado = 'finalizada'
     and (t.cerrado_at at time zone 'America/Argentina/Buenos_Aires')::date
         between r.desde and r.hasta
    left join public.pagos pg on pg.trip_id = t.id
   group by r.desde, r.hasta;
end;
$$;
