-- SPEC 19 — Validación de datos personales
-- Normaliza los teléfonos, nombres y patentes ya guardados y agrega CHECK en
-- profiles y vehicles como red de seguridad. Las reglas finas (caracteres de
-- nombre por rol, mensajes) viven en lib/validacion.ts; acá sólo lo mínimo.
-- Idempotente: seguro de re-ejecutar. Aplicar a mano desde el SQL Editor del
-- dashboard de Supabase.

-- Misma normalización que normalizarTelefono() en lib/validacion.ts: lleva un
-- teléfono argentino (+54 9, 0, 15, espacios, guiones) a 10 dígitos.
-- Devuelve NULL si no llega a 10 dígitos.
create or replace function public.normalizar_telefono(p text)
returns text
language plpgsql
immutable
as $$
declare
  d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if d like '54%' and length(d) >= 12 then d := substr(d, 3); end if;
  if d like '9%' and length(d) = 11 then d := substr(d, 2); end if;
  if d like '0%' then d := substr(d, 2); end if;
  if length(d) = 12 then
    if substr(d, 3, 2) = '15' then d := substr(d, 1, 2) || substr(d, 5);
    elsif substr(d, 4, 2) = '15' then d := substr(d, 1, 3) || substr(d, 6);
    elsif substr(d, 5, 2) = '15' then d := substr(d, 1, 4) || substr(d, 7);
    end if;
  end if;
  return case when d ~ '^[0-9]{10}$' then d else null end;
end;
$$;

-- Datos existentes: se normaliza sólo lo que da un valor válido; lo demás
-- queda como está (los CHECK son NOT VALID) y se corrige la próxima vez que
-- el usuario guarde su perfil.
update public.profiles
   set telefono = public.normalizar_telefono(telefono)
 where telefono is not null
   and public.normalizar_telefono(telefono) is not null
   and telefono <> public.normalizar_telefono(telefono);

update public.contactos_confianza
   set telefono = public.normalizar_telefono(telefono)
 where public.normalizar_telefono(telefono) is not null
   and telefono <> public.normalizar_telefono(telefono);

update public.profiles
   set nombre = regexp_replace(btrim(nombre), '\s+', ' ', 'g')
 where nombre is not null
   and nombre <> regexp_replace(btrim(nombre), '\s+', ' ', 'g');

update public.vehicles
   set patente = upper(regexp_replace(patente, '[\s.\-]', '', 'g'))
 where patente <> upper(regexp_replace(patente, '[\s.\-]', '', 'g'));

-- CHECK: rigen para todo insert/update nuevo. NOT VALID para no fallar si
-- queda alguna fila vieja que no se pudo normalizar. nombre y telefono siguen
-- siendo NULL-eables por el trigger handle_new_user (Spec 01).
alter table public.profiles drop constraint if exists profiles_telefono_formato;
alter table public.profiles add constraint profiles_telefono_formato
  check (telefono is null or telefono ~ '^[0-9]{10}$') not valid;

-- Laxo a propósito: cubre persona (nombre + apellido, hasta 81) y remisería
-- (hasta 60) sin replicar en SQL las reglas de caracteres por rol.
alter table public.profiles drop constraint if exists profiles_nombre_formato;
alter table public.profiles add constraint profiles_nombre_formato
  check (nombre is null or (nombre = btrim(nombre) and char_length(nombre) between 2 and 100)) not valid;

alter table public.vehicles drop constraint if exists vehicles_patente_formato;
alter table public.vehicles add constraint vehicles_patente_formato
  check (patente ~ '^([A-Z]{3}[0-9]{3}|[A-Z]{2}[0-9]{3}[A-Z]{2})$') not valid;

alter table public.vehicles drop constraint if exists vehicles_textos_largo;
alter table public.vehicles add constraint vehicles_textos_largo
  check (
    char_length(btrim(marca))  between 2 and 30 and
    char_length(btrim(modelo)) between 2 and 30 and
    char_length(btrim(color))  between 2 and 30
  ) not valid;
