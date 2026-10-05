-- SPEC 20 — Restricciones del vehículo
-- Idempotente: seguro de re-ejecutar. Aborta sin crear restricciones si hay
-- datos que no cumplen y no se pueden corregir solos.
--
-- Antes de aplicar, confirmar el nombre del CHECK de capacidad de la 0002:
--   select conname from pg_constraint where conrelid = 'public.vehicles'::regclass;
-- Si no es vehicles_capacidad_check, ajustar el drop del paso 3.

-- 1. Verificar lo que no se puede corregir solo. Junta todos los problemas
--    y aborta con la lista completa. Va antes de cualquier update: los CHECK
--    NOT VALID del Spec 19 rigen para toda fila que se actualice, así que
--    normalizar el color de una fila con patente inválida fallaría.
--    El color se compara ignorando mayúsculas, tildes y espacios al borde,
--    porque esas diferencias se corrigen en el paso 2.
do $$
declare
  problemas text;
begin
  select string_agg(p, E'\n') into problemas from (
    select 'patente duplicada ' || patente || ': ' || string_agg(conductor_id::text, ', ') as p
      from public.vehicles group by patente having count(*) > 1
    union all
    select 'patente inválida ' || patente || ' (' || conductor_id || ')'
      from public.vehicles
     where patente !~ '^([A-Z]{3}[0-9]{3}|[A-Z]{2}[0-9]{3}[A-Z]{2})$'
    union all
    select 'color fuera de la lista "' || color || '" (' || conductor_id || ')'
      from public.vehicles
     where translate(lower(btrim(color)), 'áéíóúü', 'aeiouu') not in
           ('blanco','negro','gris','plata','rojo','bordo','azul','celeste',
            'verde','amarillo','naranja','marron','beige','dorado','violeta')
    union all
    select 'capacidad ' || capacidad || ' fuera de 1–6 (' || conductor_id || ')'
      from public.vehicles where capacidad not between 1 and 6
    union all
    select 'marca/modelo/color fuera de 2–30 caracteres (' || conductor_id || ')'
      from public.vehicles
     where not (char_length(btrim(marca))  between 2 and 30 and
                char_length(btrim(modelo)) between 2 and 30 and
                char_length(btrim(color))  between 2 and 30)
  ) t;

  if problemas is not null then
    raise exception E'SPEC 20: corregí estos vehículos y volvé a correr la migración:\n%', problemas;
  end if;
end;
$$;

-- 2. Color: llevar a la forma canónica de la lista lo que coincide
--    ignorando mayúsculas, tildes y espacios al borde.
--    La lista tiene que coincidir con COLORES en lib/validacion.ts.
with lista(color) as (
  values ('Blanco'), ('Negro'), ('Gris'), ('Plata'), ('Rojo'), ('Bordó'),
         ('Azul'), ('Celeste'), ('Verde'), ('Amarillo'), ('Naranja'),
         ('Marrón'), ('Beige'), ('Dorado'), ('Violeta')
)
update public.vehicles v
   set color = l.color
  from lista l
 where translate(lower(btrim(v.color)), 'áéíóúü', 'aeiouu')
     = translate(lower(l.color), 'áéíóúü', 'aeiouu')
   and v.color <> l.color;

-- 3. Restricciones nuevas.
alter table public.vehicles drop constraint if exists vehicles_patente_unica;
alter table public.vehicles add constraint vehicles_patente_unica unique (patente);

alter table public.vehicles drop constraint if exists vehicles_color_lista;
alter table public.vehicles add constraint vehicles_color_lista
  check (color in ('Blanco','Negro','Gris','Plata','Rojo','Bordó','Azul','Celeste',
                   'Verde','Amarillo','Naranja','Marrón','Beige','Dorado','Violeta'));

alter table public.vehicles drop constraint if exists vehicles_capacidad_check;
alter table public.vehicles drop constraint if exists vehicles_capacidad_rango;
alter table public.vehicles add constraint vehicles_capacidad_rango
  check (capacidad between 1 and 6);

-- 4. Validar los CHECK del Spec 19 sobre las filas viejas.
alter table public.vehicles validate constraint vehicles_patente_formato;
alter table public.vehicles validate constraint vehicles_textos_largo;
