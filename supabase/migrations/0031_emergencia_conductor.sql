-- SPEC 31 — Emergencia para el conductor
-- Idempotente: segura de re-ejecutar.

-- ============================================================================
-- 1) El conductor del viaje también puede registrar una alerta
-- ============================================================================
-- Reemplaza "El pasajero registra su alerta" (0014): ahora vale para el
-- pasajero o el conductor del trip_id insertado.
drop policy if exists "El pasajero registra su alerta" on public.alertas_emergencia;
drop policy if exists "Pasajero o conductor registran su alerta" on public.alertas_emergencia;
create policy "Pasajero o conductor registran su alerta"
  on public.alertas_emergencia for insert
  with check (
    auth.uid() = usuario_id
    and exists (
      select 1 from public.trips t
       where t.id = trip_id
         and (t.pasajero_id = auth.uid() or t.conductor_id = auth.uid())
    )
  );

-- ============================================================================
-- 2) Soporte ve quién disparó la alerta
-- ============================================================================
-- Cambia el tipo de retorno (suma rol), así que hay que dropear antes:
-- create or replace no puede cambiar las columnas de una función que
-- devuelve table.
drop function if exists public.alertas_soporte();
create function public.alertas_soporte()
returns table (
  id             uuid,
  trip_id        uuid,
  usuario_id     uuid,
  nombre_usuario text,
  email          text,
  rol            public.user_role,
  origen_label   text,
  destino_label  text,
  ubic_lat       double precision,
  ubic_lng       double precision,
  created_at     timestamptz
)
language sql
security definer set search_path = public
as $$
  select a.id, a.trip_id, a.usuario_id, p.nombre, u.email, p.role,
         t.origen_label, t.destino_label, a.ubic_lat, a.ubic_lng, a.created_at
    from public.alertas_emergencia a
    join public.profiles p on p.id = a.usuario_id
    join auth.users      u on u.id = a.usuario_id
    join public.trips    t on t.id = a.trip_id
   where (select role from public.profiles where id = auth.uid()) = 'soporte'
   order by a.created_at desc;
$$;
