-- SPEC 22 — Rol de soporte y gestión de reclamos
-- Idempotente: segura de re-ejecutar.
--
-- No agrega ninguna policy de RLS nueva en reclamos ni en profiles: el acceso
-- cruzado (soporte leyendo/resolviendo reclamos de cualquier usuario) va
-- entero por las dos RPC de abajo, mismo patrón que invitar_conductor /
-- empresa_invitaciones / mis_invitaciones del Spec 11.
--
-- IMPORTANTE: ejecutar en DOS pasos separados en el SQL Editor de Supabase.
-- Un valor de enum agregado con ADD VALUE no se puede usar en la misma
-- transacción en la que se agrega (Postgres: "unsafe use of new value");
-- el SQL Editor corre todo lo pegado en una sola transacción.
--
-- Paso 1 (ejecutar solo, y esperar a que termine):
--   alter type public.user_role add value if not exists 'soporte';
--
-- Paso 2 (recién después, en una ejecución aparte): el resto de este archivo.

-- 1. Rol nuevo. Una cuenta pasa a 'soporte' a mano (update profiles.role),
--    no hay selector en /registro.
-- alter type public.user_role add value if not exists 'soporte';  -- Paso 1, ver arriba.

-- 2. Columnas nuevas en reclamos. Sin CHECK que las ate a estado = 'resuelto':
--    ya hay reclamos marcados 'resuelto' a mano (pruebas del Spec 13) sin
--    respuesta ni fecha. La regla queda sólo en resolver_reclamo(), para las
--    resoluciones nuevas.
alter table public.reclamos add column if not exists respuesta   text;
alter table public.reclamos add column if not exists resuelto_at timestamptz;

-- 3. RPC reclamos_soporte(): todos los reclamos de todos los usuarios, con
--    quién lo creó y el viaje asociado si hay. Lectura: devuelve vacío si
--    quien llama no es soporte, en vez de lanzar excepción (mismo estilo que
--    empresa_invitaciones()/mis_invitaciones()).
create or replace function public.reclamos_soporte()
returns table (
  id             uuid,
  usuario_id     uuid,
  nombre_usuario text,
  email          text,
  trip_id        uuid,
  origen_label   text,
  destino_label  text,
  motivo         text,
  descripcion    text,
  estado         text,
  respuesta      text,
  resuelto_at    timestamptz,
  created_at     timestamptz
)
language sql
security definer set search_path = public
as $$
  select r.id, r.usuario_id, p.nombre, u.email,
         r.trip_id, t.origen_label, t.destino_label,
         r.motivo, r.descripcion, r.estado, r.respuesta, r.resuelto_at, r.created_at
    from public.reclamos r
    join public.profiles p on p.id = r.usuario_id
    join auth.users      u on u.id = r.usuario_id
    left join public.trips t on t.id = r.trip_id
   where (select role from public.profiles where id = auth.uid()) = 'soporte'
   order by (r.estado = 'resuelto'), r.created_at desc;
$$;

-- 4. RPC resolver_reclamo(p_reclamo_id, p_respuesta): marca un reclamo como
--    resuelto con una respuesta. Escritura: exige soporte, respuesta no vacía
--    y un id existente; si no, lanza excepción (mismo estilo que
--    aceptar_invitacion()).
create or replace function public.resolver_reclamo(p_reclamo_id uuid, p_respuesta text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_respuesta text := btrim(p_respuesta);
begin
  if (select role from public.profiles where id = auth.uid()) <> 'soporte' then
    raise exception 'sólo soporte puede resolver reclamos';
  end if;
  if v_respuesta = '' then
    raise exception 'la respuesta no puede estar vacía';
  end if;

  update public.reclamos
     set estado = 'resuelto', respuesta = v_respuesta, resuelto_at = now()
   where id = p_reclamo_id;

  if not found then
    raise exception 'reclamo inexistente';
  end if;
end;
$$;
