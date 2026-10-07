-- SPEC 29 — Perfil público
-- Idempotente: segura de re-ejecutar. Recrea detalle_viaje() con una columna
-- más: después de esta migración no volver a ejecutar la 0028.

-- ============================================================================
-- 1) relacion_perfil: la única regla de acceso al perfil público
-- ============================================================================
-- Qué relación tiene quien llama con p_user_id, o null si ninguna (o sin
-- sesión). El orden importa: 'oferta' va último porque es la única relación
-- que no deja ver el nombre.
create or replace function public.relacion_perfil(p_user_id uuid)
returns text
language sql
stable
security definer set search_path = public
as $$
  select case
    when auth.uid() is null then null
    when p_user_id = auth.uid() then 'propio'
    when exists (
      select 1 from public.trips t
       where (t.pasajero_id = auth.uid() and t.conductor_id = p_user_id)
          or (t.conductor_id = auth.uid() and t.pasajero_id = p_user_id)
    ) then 'viaje'
    when exists (
      select 1 from public.profiles p
       where p.id = p_user_id and p.empresa_id = auth.uid()
    ) then 'empresa'
    when exists (
      select 1 from public.trip_offers o
        join public.trips t on t.id = o.trip_id
       where o.conductor_id = auth.uid() and o.estado = 'ofrecida'
         and t.pasajero_id = p_user_id
    ) then 'oferta'
  end;
$$;

-- ============================================================================
-- 2) perfil_publico: nombre, rol y reputación
-- ============================================================================
-- Cero o una fila. Sólo pasajeros y conductores tienen perfil público.
create or replace function public.perfil_publico(p_user_id uuid)
returns table (
  id       uuid,
  nombre   text,
  role     public.user_role,
  promedio numeric,
  cantidad integer
)
language sql
stable
security definer set search_path = public
as $$
  select p.id,
         -- con sólo una oferta abierta, el conductor todavía no ve el nombre
         case when public.relacion_perfil(p_user_id) <> 'oferta' then p.nombre end,
         p.role,
         (select round(avg(c.estrellas)::numeric, 1)
            from public.calificaciones c where c.destinatario_id = p.id),
         (select count(*)::integer
            from public.calificaciones c where c.destinatario_id = p.id)
    from public.profiles p
   where p.id = p_user_id
     and p.role in ('pasajero', 'conductor')
     and public.relacion_perfil(p_user_id) is not null;
$$;

-- ============================================================================
-- 3) comentarios_recibidos: las reseñas, anónimas
-- ============================================================================
-- Sólo estrellas, texto y el mes: nunca el autor, el viaje ni el día. Las
-- calificaciones sin comentario cuentan en el promedio pero no se listan.
create or replace function public.comentarios_recibidos(p_user_id uuid)
returns table (
  estrellas  smallint,
  comentario text,
  mes        date
)
language sql
stable
security definer set search_path = public
as $$
  select c.estrellas, c.comentario, date_trunc('month', c.created_at)::date
    from public.calificaciones c
   where c.destinatario_id = p_user_id
     and c.comentario is not null
     and public.relacion_perfil(p_user_id) is not null
   order by c.created_at desc
   limit 20;
$$;

-- ============================================================================
-- 4) detalle_viaje recreada: suma contraparte_id
-- ============================================================================
-- Parte del cuerpo del Spec 28 y agrega el id de la contraparte, para enlazar
-- a su perfil público. Cambia el returns table -> drop + create.
drop function if exists public.detalle_viaje(uuid);

create function public.detalle_viaje(p_trip_id uuid)
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
  contraparte_id  uuid,
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
         case
           when t.pasajero_id = auth.uid() then t.conductor_id
           else t.pasajero_id
         end as contraparte_id,
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
