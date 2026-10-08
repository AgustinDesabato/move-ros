-- SPEC 21 — Validación de alias/CVU y contactos
-- Idempotente: seguro de re-ejecutar. Aborta sin cambiar nada si hay
-- datos que no cumplen y no se pueden corregir solos.

-- Misma normalización que validarAliasCvu() en lib/validacion.ts (sin el
-- dígito verificador): CVU/CBU sin espacios ni guiones, alias en minúsculas,
-- vacío a NULL.
create or replace function public.normalizar_alias_cvu(p text)
returns text
language sql
immutable
as $$
  select case
    when btrim(coalesce(p, '')) = '' then null
    when regexp_replace(p, '[\s-]', '', 'g') ~ '^[0-9]+$'
      then regexp_replace(p, '[\s-]', '', 'g')
    else lower(btrim(p))
  end;
$$;

-- 1. Verificar antes de cualquier update. Los CHECK NOT VALID del Spec 19 en
--    profiles rigen para toda fila que se actualice, así que normalizar el
--    alias de un perfil con teléfono o nombre inválido fallaría: también se
--    listan esos casos.
do $$
declare
  problemas text;
begin
  select string_agg(p, E'\n') into problemas from (
    select 'alias/CVU inválido "' || alias_cvu || '" (' || id || ')' as p
      from public.profiles
     where public.normalizar_alias_cvu(alias_cvu) is not null
       and public.normalizar_alias_cvu(alias_cvu) !~ '^([0-9]{22}|[a-z0-9.-]{6,20})$'
    union all
    select 'perfil con alias a normalizar y teléfono/nombre fuera del Spec 19 (' || id || ')'
      from public.profiles
     where alias_cvu is distinct from public.normalizar_alias_cvu(alias_cvu)
       and not (
         (telefono is null or telefono ~ '^[0-9]{10}$') and
         (nombre is null or (nombre = btrim(nombre) and char_length(nombre) between 2 and 100))
       )
    union all
    select 'teléfono de contacto inválido "' || telefono || '" (' || id || ')'
      from public.contactos_confianza
     where public.normalizar_telefono(telefono) is null
  ) t;

  if problemas is not null then
    raise exception E'SPEC 21: corregí estas filas y volvé a correr la migración:\n%', problemas;
  end if;
end;
$$;

-- 2. Normalizar.
update public.profiles
   set alias_cvu = public.normalizar_alias_cvu(alias_cvu)
 where alias_cvu is distinct from public.normalizar_alias_cvu(alias_cvu);

update public.contactos_confianza
   set telefono = public.normalizar_telefono(telefono)
 where telefono <> public.normalizar_telefono(telefono);

-- 3. Restricciones.
alter table public.profiles drop constraint if exists profiles_alias_cvu_formato;
alter table public.profiles add constraint profiles_alias_cvu_formato
  check (alias_cvu is null
         or alias_cvu ~ '^[0-9]{22}$'
         or alias_cvu ~ '^[a-z0-9.-]{6,20}$');

alter table public.contactos_confianza drop constraint if exists contactos_telefono_formato;
alter table public.contactos_confianza add constraint contactos_telefono_formato
  check (telefono ~ '^[0-9]{10}$');
