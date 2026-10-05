-- SPEC 23 — El rol soporte ve las alertas de emergencia
-- Idempotente: segura de re-ejecutar.
--
-- No agrega ninguna policy de RLS nueva en alertas_emergencia, profiles ni
-- trips: el acceso cruzado (soporte leyendo alertas de cualquier usuario) va
-- entero por esta RPC, mismo patrón que reclamos_soporte() del Spec 22.
--
-- A diferencia de la 0022, no toca ningún enum: se puede pegar y ejecutar
-- entera de una sola vez.

create or replace function public.alertas_soporte()
returns table (
  id             uuid,
  trip_id        uuid,
  usuario_id     uuid,
  nombre_usuario text,
  email          text,
  origen_label   text,
  destino_label  text,
  ubic_lat       double precision,
  ubic_lng       double precision,
  created_at     timestamptz
)
language sql
security definer set search_path = public
as $$
  select a.id, a.trip_id, a.usuario_id, p.nombre, u.email,
         t.origen_label, t.destino_label, a.ubic_lat, a.ubic_lng, a.created_at
    from public.alertas_emergencia a
    join public.profiles p on p.id = a.usuario_id
    join auth.users      u on u.id = a.usuario_id
    join public.trips    t on t.id = a.trip_id
   where (select role from public.profiles where id = auth.uid()) = 'soporte'
   order by a.created_at desc;
$$;
