-- SPEC 01 — Autenticación y roles
-- Rol único por usuario
create type public.user_role as enum ('pasajero', 'conductor');

-- Una fila por usuario autenticado
create table public.profiles (
  id         uuid        primary key references auth.users (id) on delete cascade,
  role       public.user_role not null,
  created_at timestamptz not null default now()
);

-- RLS: cada usuario solo ve y edita su propia fila
alter table public.profiles enable row level security;

create policy "Los usuarios ven su propio perfil"
  on public.profiles for select
  using ( auth.uid() = id );

create policy "Los usuarios editan su propio perfil"
  on public.profiles for update
  using ( auth.uid() = id );

-- Crea la fila en profiles cuando se registra un usuario,
-- leyendo el rol desde raw_user_meta_data
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, role)
  values (new.id, (new.raw_user_meta_data ->> 'role')::public.user_role);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
