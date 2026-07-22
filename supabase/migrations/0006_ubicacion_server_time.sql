-- SPEC 06 (revisión) — Frescura de la ubicación calculada en el servidor
-- Idempotente: seguro de re-ejecutar.
--
-- Motivación: antes la Server Action escribía ubic_at con el reloj del conductor
-- y el pasajero evaluaba la frescura contra su propio reloj (dos dispositivos
-- distintos). El skew entre relojes podía congelar u ocultar el marcador. Ahora:
--   - la escritura usa now() del servidor (RPC reportar_ubicacion),
--   - la vigencia se calcula en el servidor (datos_conductor devuelve un booleano).
-- El pasajero sólo renderiza el flag; no compara timestamps.

-- ============================================================================
-- 1) RPC de escritura de la posición (hora del servidor)
-- ============================================================================
-- Actualiza sólo la fila del propio conductor (auth.uid()); ubic_at = now() del
-- servidor, fuente única de verdad de la frescura.
create or replace function public.reportar_ubicacion(
  p_lat double precision,
  p_lng double precision
)
returns void
language sql
security definer set search_path = public
as $$
  update public.profiles
     set ubic_lat = p_lat, ubic_lng = p_lng, ubic_at = now()
   where id = auth.uid() and role = 'conductor';
$$;

-- ============================================================================
-- 2) datos_conductor: la vigencia se calcula en el servidor
-- ============================================================================
-- Cambia el tipo de retorno (drop + create): reemplaza ubic_at por ubic_vigente,
-- un booleano = "la posición es reciente (< 30s) según el reloj del servidor".
drop function if exists public.datos_conductor(uuid);

create function public.datos_conductor(p_trip_id uuid)
returns table (
  nombre       text,
  marca        text,
  modelo       text,
  patente      text,
  color        text,
  ubic_lat     double precision,
  ubic_lng     double precision,
  ubic_vigente boolean
)
language sql
security definer set search_path = public
as $$
  select p.nombre, v.marca, v.modelo, v.patente, v.color,
         p.ubic_lat, p.ubic_lng,
         (p.ubic_at is not null
          and p.ubic_at > now() - interval '30 seconds') as ubic_vigente
  from public.trips t
  join public.profiles p on p.id = t.conductor_id
  join public.vehicles v on v.conductor_id = t.conductor_id
  where t.id = p_trip_id
    and t.pasajero_id = auth.uid()
    and t.conductor_id is not null;
$$;
