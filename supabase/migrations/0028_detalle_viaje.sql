-- SPEC 28 — Detalle de un viaje
-- Idempotente: segura de re-ejecutar (sólo create or replace function).

-- Un viaje con todo lo que muestra /viajes/[id]: el nombre de la contraparte,
-- el pago y la calificación que dio quien llama. Es security definer porque
-- cruza a profiles, que la RLS no deja leer del otro rol (mismo motivo que
-- historial_viajes). Se acota a los dos participantes con auth.uid() en el
-- where: sin sesión o para un viaje ajeno, devuelve vacío.
-- No filtra por estado: la página redirige si el viaje sigue activo.
create or replace function public.detalle_viaje(p_trip_id uuid)
returns table (
  id              uuid,
  estado          public.trip_status,
  created_at      timestamptz,
  cerrado_at      timestamptz,
  origen_label    text,
  origen_lat      double precision,
  origen_lng      double precision,
  destino_label   text,
  destino_lat     double precision,
  destino_lng     double precision,
  distancia_m     integer,
  duracion_s      integer,
  tarifa_estimada integer,
  metodo_pago     public.metodo_pago,
  soy_conductor   boolean,
  contraparte     text,
  pago_estado     public.pago_estado,
  pago_monto      integer,
  pago_comision   integer,
  pago_neto       integer,
  pago_a_empresa  boolean,
  mi_estrellas    smallint,
  mi_comentario   text
)
language sql
stable
security definer set search_path = public
as $$
  select t.id, t.estado, t.created_at, t.cerrado_at,
         t.origen_label, t.origen_lat, t.origen_lng,
         t.destino_label, t.destino_lat, t.destino_lng,
         t.distancia_m, t.duracion_s, t.tarifa_estimada, t.metodo_pago,
         coalesce(t.conductor_id = auth.uid(), false) as soy_conductor,
         case
           when t.pasajero_id = auth.uid() then cp.nombre   -- miro como pasajero -> conductor
           else pp.nombre                                    -- miro como conductor -> pasajero
         end as contraparte,
         pg.estado as pago_estado,
         pg.monto  as pago_monto,
         -- comisión y neto sólo para el conductor
         case when t.conductor_id = auth.uid() then pg.comision end as pago_comision,
         case when t.conductor_id = auth.uid() then pg.neto     end as pago_neto,
         (pg.id is not null and pg.destinatario_id <> t.conductor_id) as pago_a_empresa,
         c.estrellas  as mi_estrellas,
         c.comentario as mi_comentario
    from public.trips t
    left join public.profiles cp on cp.id = t.conductor_id
    left join public.profiles pp on pp.id = t.pasajero_id
    left join public.pagos pg on pg.trip_id = t.id
    left join public.calificaciones c
           on c.trip_id = t.id and c.autor_id = auth.uid()
   where t.id = p_trip_id
     and (t.pasajero_id = auth.uid() or t.conductor_id = auth.uid());
$$;
