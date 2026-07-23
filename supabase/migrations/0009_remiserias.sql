-- ============================================================================
-- SPEC 09 — Capa de propiedad de remiserías (mínima)
-- ============================================================================
-- Rol nuevo `empresa` (una fila de profiles = la remisería, el admin ES ese
-- usuario). Un conductor puede pertenecer a una empresa vía profiles.empresa_id
-- (null = independiente). La empresa agrega/quita conductores por email y ve,
-- por RPC security definer, sus conductores + viajes cerrados + métricas del día.
-- No toca el despacho ni la tarifa.
--
-- Idempotente: segura de re-ejecutar.
-- Aplicar a mano desde el SQL Editor del dashboard de Supabase (el proyecto no
-- tiene CLI vinculado). NO envolver en BEGIN/COMMIT: `alter type ... add value`
-- no puede usarse en la misma transacción en que se agrega el valor.
-- ============================================================================

-- ============================================================================
-- 1) Rol nuevo + columna de propiedad
-- ============================================================================
-- Aditivo: no rompe el enum existente. Las funciones de abajo referencian el
-- literal 'empresa' pero sólo lo resuelven en ejecución (no al crearse), así que
-- conviven en el mismo script.
alter type public.user_role add value if not exists 'empresa';

-- Un conductor puede pertenecer a una empresa (fila de profiles con role='empresa').
-- null = conductor independiente (como todo hoy). on delete set null: si se borra
-- la empresa, sus conductores vuelven a independientes.
alter table public.profiles
  add column if not exists empresa_id uuid references public.profiles(id) on delete set null;

create index if not exists profiles_empresa_id_idx on public.profiles (empresa_id);

-- ============================================================================
-- 2) RPC agregar_conductor(p_email)
-- ============================================================================
-- La empresa reclama a un conductor ya registrado por su email. Valida rol de
-- quien llama, existencia del email, que sea conductor y que no pertenezca a
-- otra empresa (bloquea el "robo"). auth.users no es legible por RLS; esta
-- función security definer sí lo lee.
create or replace function public.agregar_conductor(p_email text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid  uuid;
  v_role public.user_role;
  v_emp  uuid;
begin
  if (select role from public.profiles where id = auth.uid()) <> 'empresa' then
    raise exception 'sólo una empresa puede agregar conductores';
  end if;

  select id into v_uid from auth.users where lower(email) = lower(trim(p_email));
  if v_uid is null then
    raise exception 'no existe un usuario con ese email';
  end if;
  if v_uid = auth.uid() then
    raise exception 'no podés agregarte a vos mismo';
  end if;

  select role, empresa_id into v_role, v_emp
    from public.profiles where id = v_uid;
  if v_role <> 'conductor' then
    raise exception 'ese usuario no es un conductor';
  end if;
  if v_emp is not null and v_emp <> auth.uid() then
    raise exception 'el conductor ya pertenece a otra empresa';
  end if;

  update public.profiles set empresa_id = auth.uid() where id = v_uid;
end;
$$;

-- ============================================================================
-- 3) RPC quitar_conductor(p_conductor_id)
-- ============================================================================
-- Sólo la empresa dueña puede desvincular; devuelve al conductor a independiente.
create or replace function public.quitar_conductor(p_conductor_id uuid)
returns void
language sql
security definer set search_path = public
as $$
  update public.profiles
     set empresa_id = null
   where id = p_conductor_id and empresa_id = auth.uid();
$$;

-- ============================================================================
-- 4) RPC empresa_conductores()
-- ============================================================================
-- Los conductores de la empresa que llama, con email y las dos métricas del día
-- (día local de Argentina, no UTC). finalizadas_hoy = viajes finalizada con
-- cerrado_at hoy; suma_tarifas_hoy = suma de esas tarifas (no es "recaudado").
create or replace function public.empresa_conductores()
returns table (
  id               uuid,
  nombre           text,
  email            text,
  finalizadas_hoy  integer,
  suma_tarifas_hoy integer
)
language sql
security definer set search_path = public
as $$
  select c.id, c.nombre, u.email,
         count(t.id)::integer                        as finalizadas_hoy,
         coalesce(sum(t.tarifa_estimada), 0)::integer as suma_tarifas_hoy
    from public.profiles c
    join auth.users u on u.id = c.id
    left join public.trips t
      on t.conductor_id = c.id
     and t.estado = 'finalizada'
     and (t.cerrado_at at time zone 'America/Argentina/Buenos_Aires')::date
       = (now()        at time zone 'America/Argentina/Buenos_Aires')::date
   where c.empresa_id = auth.uid()
   group by c.id, c.nombre, u.email
   order by c.nombre;
$$;

-- ============================================================================
-- 5) RPC empresa_viajes_conductor(p_conductor_id)
-- ============================================================================
-- Los viajes cerrados (finalizada/cancelada) de un conductor, validando que sea
-- de la empresa que llama. Ordenados por cierre desc, acotados a 50.
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
security definer set search_path = public
as $$
  select t.id, t.origen_label, t.destino_label, t.distancia_m, t.tarifa_estimada,
         t.estado, t.cerrado_at, t.created_at
    from public.trips t
   where t.conductor_id = p_conductor_id
     and t.conductor_id in (
       select id from public.profiles where empresa_id = auth.uid()
     )
     and t.estado in ('finalizada', 'cancelada')
   order by coalesce(t.cerrado_at, t.created_at) desc
   limit 50;
$$;
