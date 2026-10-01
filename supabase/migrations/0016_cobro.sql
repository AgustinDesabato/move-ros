-- SPEC 15 — Pago por transferencia
-- Idempotente: seguro de re-ejecutar.

-- Alias o CVU para recibir transferencias. Sólo lo cargan conductor y empresa
-- (el pasajero no cobra); nullable porque no es obligatorio al registrarse.
alter table public.profiles
  add column if not exists alias_cvu text;

-- Le resuelve al pasajero a quién transferirle: la empresa del conductor si
-- pertenece a una, si no el propio conductor (mismo criterio que
-- registrar_pago en el Spec 10). Sólo el pasajero del viaje puede consultarlo.
create or replace function public.datos_cobro(p_trip_id uuid)
returns table (alias_cvu text, nombre_titular text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_trip      public.trips;
  v_emp       uuid;
  v_dest      uuid;
begin
  select * into v_trip from public.trips where id = p_trip_id;
  if v_trip.id is null or v_trip.pasajero_id <> auth.uid() then
    raise exception 'viaje inexistente o no sos el pasajero';
  end if;

  select p.empresa_id into v_emp from public.profiles p where p.id = v_trip.conductor_id;
  v_dest := coalesce(v_emp, v_trip.conductor_id);

  return query
    select p.alias_cvu, p.nombre from public.profiles p where p.id = v_dest;
end;
$$;
