-- SPEC 17 — "Ver viajes": sólo los viajes hechos para la remisería
-- empresa_viajes_conductor (Spec 09) devolvía todos los viajes cerrados del
-- conductor, incluidos los que hizo antes de entrar a la flota (como independiente
-- o en otra remisería), y nada de un ex conductor. Ahora el criterio es el mismo
-- que el de las estadísticas (0017): el viaje es de la remisería, no del conductor.
-- Misma firma: no cambian los tipos ni la action. Idempotente (create or replace).
-- Aplicar a mano desde el SQL Editor del dashboard de Supabase.
--
-- Un viaje es de la remisería si:
--   - finalizada: su asiento en pagos tiene destinatario_id = la remisería. Vale
--     también para ex conductores: el destinatario queda fijo al cobrar.
--   - cancelada: no tiene asiento en pagos, así que se usa la fecha de ingreso a
--     la flota (resuelta_at de la última invitación aceptada de esta remisería).
--     Sólo para la flota actual: no se guarda cuándo se quitó a un conductor, así
--     que no hay forma de acotar el período de un ex conductor. Un conductor sin
--     invitación aceptada (alta directa del Spec 09) tampoco muestra cancelados:
--     ante la duda, no se expone.

create or replace function public.empresa_viajes_conductor(p_conductor_id uuid)
returns table (
  id              uuid,
  origen_label    text,
  destino_label   text,
  distancia_m     integer,
  tarifa_estimada integer,
  estado          public.trip_status,
  cerrado_at      timestamptz,
  created_at      timestamptz
)
language sql
stable
security definer set search_path = public
as $$
  with ingreso as (
    select max(i.resuelta_at) as desde
      from public.invitaciones i
      join public.profiles p on p.id = i.conductor_id
     where i.empresa_id = auth.uid()
       and i.conductor_id = p_conductor_id
       and i.estado = 'aceptada'
       and p.empresa_id = auth.uid()   -- sigue en la flota
  )
  select t.id, t.origen_label, t.destino_label, t.distancia_m, t.tarifa_estimada,
         t.estado, t.cerrado_at, t.created_at
    from public.trips t
   cross join ingreso
   where t.conductor_id = p_conductor_id
     and (select pr.role from public.profiles pr where pr.id = auth.uid()) = 'empresa'
     and (
       (t.estado = 'finalizada' and exists (
          select 1 from public.pagos pg
           where pg.trip_id = t.id and pg.destinatario_id = auth.uid()
       ))
       or
       (t.estado = 'cancelada' and t.created_at >= ingreso.desde)
     )
   order by coalesce(t.cerrado_at, t.created_at) desc
   limit 50;
$$;
