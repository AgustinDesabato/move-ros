-- ============================================================================
-- Fix: quitar_conductor / cancelar_invitacion dejan de ser no-op silenciosos
-- ============================================================================
-- Síntoma: la empresa "quitaba" un conductor y la UI mostraba éxito, pero en la
-- DB el empresa_id seguía seteado (o la invitación seguía viva). Causa: si el
-- update no afectaba ninguna fila (vista desactualizada, el conductor ya no
-- pertenecía a esa empresa, o la invitación ya no estaba pendiente), la función
-- terminaba sin error y sin cambiar nada -> "éxito fantasma".
--
-- Ahora ambas RPC lanzan una excepción legible si no tocaron ninguna fila, para
-- que la Server Action la muestre y la empresa refresque y vea el estado real.
-- Idempotente (create or replace). Aplicar a mano desde el SQL Editor.
-- ============================================================================

create or replace function public.quitar_conductor(p_conductor_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profiles
     set empresa_id = null
   where id = p_conductor_id
     and empresa_id = auth.uid();

  if not found then
    raise exception 'no se pudo quitar: ese conductor no pertenece a tu remisería (probá refrescar la página)';
  end if;
end;
$$;

create or replace function public.cancelar_invitacion(p_invitacion_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.invitaciones
     set estado = 'cancelada', resuelta_at = now()
   where id = p_invitacion_id
     and empresa_id = auth.uid()
     and estado = 'pendiente';

  if not found then
    raise exception 'esa invitación ya no está pendiente (probá refrescar la página)';
  end if;
end;
$$;
