-- SPEC 30 — Salir de la remisería por cuenta propia
-- Idempotente: segura de re-ejecutar.

-- ============================================================================
-- 1) salir_de_empresa: el conductor se desvincula solo
-- ============================================================================
-- Lo devuelve a independiente. No puede salir con un viaje aceptado o en curso:
-- el destinatario del pago se resuelve al finalizar (registrar_pago, Spec 10), así
-- que salir en el medio le sacaría ese cobro a la remisería.
create or replace function public.salir_de_empresa()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_role public.user_role;
  v_emp  uuid;
begin
  select role, empresa_id into v_role, v_emp
    from public.profiles where id = auth.uid();
  if v_role is distinct from 'conductor' then
    raise exception 'sólo un conductor puede salir de una remisería';
  end if;
  if v_emp is null then
    raise exception 'no pertenecés a ninguna remisería';
  end if;
  if exists (
    select 1 from public.trips
     where conductor_id = auth.uid() and estado in ('aceptada', 'en_curso')
  ) then
    raise exception 'Terminá tu viaje en curso antes de salir de la remisería.';
  end if;

  update public.profiles set empresa_id = null where id = auth.uid();
end;
$$;

-- ============================================================================
-- 2) empresa_id sólo se cambia por RPC
-- ============================================================================
-- La policy de update de profiles (Spec 01) deja editar cualquier columna propia.
-- Este trigger rechaza los cambios de empresa_id que vienen directo de la API
-- (rol authenticated o anon). Las RPC security definer corren como el dueño de la
-- función, así que pasan. El trigger NO es security definer: necesita ver el
-- current_user de quien hace el update.
create or replace function public.proteger_empresa_id()
returns trigger
language plpgsql
as $$
begin
  if new.empresa_id is distinct from old.empresa_id
     and current_user in ('authenticated', 'anon') then
    raise exception 'empresa_id sólo se cambia con invitaciones o saliendo de la remisería';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_empresa_id_protegida on public.profiles;
create trigger profiles_empresa_id_protegida
  before update on public.profiles
  for each row execute function public.proteger_empresa_id();
