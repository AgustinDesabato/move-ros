-- SPEC 22 — Corrección de resolver_reclamo()
-- Idempotente: segura de re-ejecutar (sólo create or replace function).
--
-- La versión de la 0022 comparaba el rol con "<> 'soporte'". Sin sesión
-- (auth.uid() nulo) o sin fila en profiles, el rol da NULL, la comparación da
-- NULL y el "if" no lanzaba la excepción: el update corría igual. Con
-- "is distinct from" un rol NULL también se rechaza, como ya hace
-- estadisticas_empresa() en la 0017.
create or replace function public.resolver_reclamo(p_reclamo_id uuid, p_respuesta text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_respuesta text := btrim(p_respuesta);
begin
  if (select role from public.profiles where id = auth.uid())
     is distinct from 'soporte' then
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
