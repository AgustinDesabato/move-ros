# SPEC 09 — Capa de propiedad de remiserías (mínima)

> **Estado:** implementado
> **Depende de:** SPEC 01, SPEC 02, SPEC 04, SPEC 05
> **Fecha:** 2026-07-23
> **Objetivo:** Introducir la remisería como entidad dueña de conductores —un rol nuevo `empresa` que registra su cuenta, agrega/quita conductores ya registrados por email (uno pertenece a lo sumo a una empresa) y ve, en `/empresa`, la lista de sus conductores con sus viajes cerrados y, por conductor, la cantidad de viajes finalizados del día y la suma de esas tarifas— sin tocar el despacho ni la tarifa, y dejando el terreno listo para que el Spec de pagos contemple a la empresa como posible destinatario.

Este spec agrega la **capa de propiedad** que faltaba en el modelo: hasta ahora un conductor era siempre independiente (`user_role` sólo tenía `pasajero`/`conductor`, y toda la RLS asume "cada uno ve sólo lo suyo"). Acá aparece la **remisería** como un tercer rol (`empresa`), modelada como una fila de `profiles` (el admin de la empresa **es** ese usuario). Un conductor puede pertenecer a una empresa vía un `empresa_id` nullable (null = independiente, que es como funciona todo hoy). La empresa agrega conductores por email y los ve en una vista `/empresa` read-only: sus conductores, los viajes cerrados de cada uno, y por conductor la **cantidad de finalizados del día** y la **suma de esas tarifas** (no se llama "recaudado" porque todavía no hay cobro real). Deliberadamente **no** se toca el despacho (un conductor de empresa se despacha igual que uno independiente) ni la tarifa; el despacho de flota, los dashboards y la tarifa propia quedan para la capa 2, y el cobro para el Spec de pagos.

## Alcance

**Incluye:**

- Migración SQL `supabase/migrations/0009_remiserias.sql` (idempotente):
  - `alter type public.user_role add value if not exists 'empresa'` (aditivo; no rompe el enum existente).
  - Columna nueva en `profiles`: `empresa_id uuid references public.profiles(id)` (nullable; null = conductor independiente, como todo hoy). Se apoya en un índice `profiles_empresa_id_idx`.
  - RPC `agregar_conductor(p_email)` (`security definer`): valida que quien llama sea `empresa`, busca un `conductor` ya registrado por su email (en `auth.users`), y setea su `empresa_id`. Rechaza si el email no existe, no es conductor, o el conductor ya pertenece a otra empresa (bloquea con error).
  - RPC `quitar_conductor(p_conductor_id)` (`security definer`): valida que quien llama sea la empresa dueña de ese conductor y limpia su `empresa_id` (lo devuelve a independiente).
  - RPC `empresa_conductores()` (`security definer`): devuelve los conductores de la empresa que llama, cada uno con `nombre`, `email`, `finalizadas_hoy` (cantidad de viajes `finalizada` con `cerrado_at` en el **día local de Argentina**) y `suma_tarifas_hoy` (suma de `tarifa_estimada` de esos viajes).
  - RPC `empresa_viajes_conductor(p_conductor_id)` (`security definer`): devuelve los viajes cerrados (`finalizada`/`cancelada`) de un conductor, validando que ese conductor pertenezca a la empresa que llama.
- **Tipos TypeScript** (`lib/supabase/types.ts`, extendido): `UserRole` gana `"empresa"`; `Profile` gana `empresa_id: string | null`; nuevos tipos `EmpresaConductor` (fila de `empresa_conductores`) y `ViajeConductor` (fila de `empresa_viajes_conductor`).
- **Helper de perfil** (`lib/perfil.ts`, extendido): `perfilCompleto` contempla el rol `empresa` (requiere `nombre` + `telefono`, sin vehículo).
- **Registro** (`app/registro/page.tsx`): agregar "empresa" como opción de rol (junto a pasajero/conductor).
- **Perfil** (`app/perfil/perfil-form.tsx`): rama para el rol `empresa` (sólo `nombre` = nombre de la remisería y `telefono` = contacto; sin el fieldset de vehículo).
- **Ruta nueva `/empresa`** (`app/empresa/page.tsx`), Server Component, sólo para el rol `empresa`:
  - Exige sesión y rol `empresa` (si no, redirige).
  - Lista sus conductores (RPC `empresa_conductores`): por cada uno, nombre, email, **finalizados del día** y **suma de esas tarifas**.
  - Formulario para **agregar un conductor por email**, y acción para **quitarlo**.
  - Por conductor, ver sus **viajes cerrados** (RPC `empresa_viajes_conductor`): origen, destino, fecha, tarifa, estado. Sin polling (lectura estática).
- **Server Actions de empresa** (`app/actions/empresa.ts`, nuevo): `agregarConductor(email)`, `quitarConductor(id)`, `getConductores()`, `getViajesConductor(id)`.
- **Navegación y guards de rol:**
  - La raíz (`app/page.tsx`) y los guards de `/viajar`, `/conducir`, `/perfil` mandan al usuario `empresa` a `/empresa` (y bloquean que un `empresa` entre a `/viajar`/`/conducir`, y viceversa).
  - `/empresa` tiene header con enlaces "Mi perfil" y "Salir", como las otras vistas.

**Fuera de alcance (para specs futuros):**

- **Cobro / comisión / liquidación** de la empresa: es el Spec de pagos. Por eso la columna se llama "suma de tarifas", no "recaudado".
- **Despacho de flota:** un conductor de empresa se despacha exactamente igual que uno independiente. Preferir/priorizar la flota propia queda para la capa 2.
- **Tarifa propia** de la remisería (hoy la tarifa es única de plataforma, `lib/tarifa.ts`).
- **Dashboards y métricas** más allá de "finalizados del día + suma de esas tarifas" (rangos de fechas, históricos, exportar, ingresos por período).
- **Consentimiento/invitación** del conductor: el admin lo agrega directo, sin que el conductor acepte.
- Que el **conductor vea o cambie** su remisería: su experiencia (`/conducir`, `/perfil`) queda igual.
- **Pool de vehículos** de la empresa (los vehículos siguen siendo del conductor, Spec 02).
- **Rating/branding** de la empresa (la reputación del Spec 08 sigue siendo por persona).
- **Multi-admin** por empresa: la remisería es una sola cuenta (una fila de `profiles`).
- Onboarding self-service de conductores por parte de la empresa más allá de "agregar por email".

## Modelo de datos

Migración `supabase/migrations/0009_remiserias.sql`. Idempotente (segura de re-ejecutar).

### Rol nuevo + columna de propiedad

```sql
-- Rol nuevo. Aditivo: no rompe el enum existente. Debe quedar commiteado antes
-- de usarse como valor en datos (ver Riesgos).
alter type public.user_role add value if not exists 'empresa';

-- Un conductor puede pertenecer a una empresa (fila de profiles con role='empresa').
-- null = conductor independiente (como todo hoy). on delete set null: si se borra la
-- empresa, sus conductores vuelven a independientes.
alter table public.profiles
  add column if not exists empresa_id uuid references public.profiles(id) on delete set null;

create index if not exists profiles_empresa_id_idx on public.profiles (empresa_id);
```

Convención: `empresa_id` sólo se setea en filas `role='conductor'`, apuntando a una fila `role='empresa'`. La empresa **es** una fila de `profiles` (su admin loguea como ese usuario); reusa `nombre` (nombre de la remisería) y `telefono` (contacto) del Spec 02.

### RLS

No se agregan policies nuevas. Todo el acceso cruzado (la empresa leyendo/escribiendo datos de sus conductores) va por RPC `security definer` que validan la pertenencia con `auth.uid()`, igual que `datos_conductor`/`historial_viajes` en specs previos. Las policies de `profiles` y `trips` quedan intactas.

### RPC `agregar_conductor(p_email)`

`security definer`. La empresa reclama a un conductor ya registrado por su email.

```sql
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
  -- quien llama tiene que ser una empresa
  if (select role from public.profiles where id = auth.uid()) <> 'empresa' then
    raise exception 'sólo una empresa puede agregar conductores';
  end if;

  -- buscar al usuario por email (auth.users no es legible por RLS; esta función
  -- security definer sí lo lee)
  select id into v_uid from auth.users where lower(email) = lower(trim(p_email));
  if v_uid is null then
    raise exception 'no existe un usuario con ese email';
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
```

### RPC `quitar_conductor(p_conductor_id)`

`security definer`. Sólo la empresa dueña puede desvincular; lo devuelve a independiente.

```sql
create or replace function public.quitar_conductor(p_conductor_id uuid)
returns void
language sql
security definer set search_path = public
as $$
  update public.profiles
     set empresa_id = null
   where id = p_conductor_id and empresa_id = auth.uid();
$$;
```

### RPC `empresa_conductores()`

`security definer`. Los conductores de la empresa que llama, con email y las dos métricas del día (día local de Argentina).

```sql
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
```

### RPC `empresa_viajes_conductor(p_conductor_id)`

`security definer`. Los viajes cerrados de un conductor, validando que sea de la empresa que llama.

```sql
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
```

### Tipos TypeScript (`lib/supabase/types.ts`, extendido)

```ts
// UserRole gana el rol empresa.
export type UserRole = "pasajero" | "conductor" | "empresa";

// Profile gana la pertenencia a una empresa (null = conductor independiente).
export type Profile = {
  // …campos previos…
  empresa_id: string | null;
};

// Una fila de empresa_conductores(): un conductor de la empresa + métricas del día.
export type EmpresaConductor = {
  id: string;
  nombre: string | null;
  email: string;
  finalizadas_hoy: number;
  suma_tarifas_hoy: number;
};

// Un viaje cerrado de un conductor, tal como lo devuelve empresa_viajes_conductor().
export type ViajeConductor = {
  id: string;
  origen_label: string;
  destino_label: string;
  distancia_m: number;
  tarifa_estimada: number;
  estado: TripStatus;
  cerrado_at: string | null;
  created_at: string;
};
```

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Migración.** Escribir y ejecutar `supabase/migrations/0009_remiserias.sql`: `alter type user_role add value 'empresa'`, columna `profiles.empresa_id` + índice, y las RPC `agregar_conductor`, `quitar_conductor`, `empresa_conductores`, `empresa_viajes_conductor`. *Verificación (SQL Editor):* registrar (o marcar) una fila `role='empresa'`; `agregar_conductor('<email de un conductor>')` setea su `empresa_id`; sobre un email inexistente / un pasajero / un conductor de otra empresa tira excepción; `quitar_conductor` lo limpia; `empresa_conductores()` como esa empresa lista sus conductores con `finalizadas_hoy`/`suma_tarifas_hoy`; `empresa_viajes_conductor('<id>')` trae sus viajes cerrados.

2. **Tipos.** En `lib/supabase/types.ts`: `UserRole` gana `"empresa"`, `Profile` gana `empresa_id`, y se agregan `EmpresaConductor` y `ViajeConductor`. *Verificación:* `npm run lint` pasa.

3. **Helper de perfil.** En `lib/perfil.ts`: `perfilCompleto` contempla el rol `empresa` (requiere `nombre` + `telefono`, sin vehículo). *Verificación:* una empresa con nombre y teléfono da `perfilCompleto = true`; sin ellos, `false`.

4. **Registro.** En `app/registro/page.tsx`: agregar "empresa" como opción de rol (junto a pasajero/conductor), que se guarda en `raw_user_meta_data` como los otros. *Verificación:* se puede registrar una cuenta con rol empresa y `handle_new_user` le crea la fila en `profiles`.

5. **Perfil.** En `app/perfil/perfil-form.tsx`: rama para `empresa` (sólo `nombre` = nombre de la remisería y `telefono` = contacto; sin el fieldset de vehículo). *Verificación:* una empresa ve y guarda sólo nombre + teléfono; un conductor sigue viendo el fieldset de vehículo.

6. **Guards de rol y navegación.** En `app/page.tsx` y los guards de `app/viajar/page.tsx`, `app/conducir/page.tsx` y `app/perfil/page.tsx`: mandar al usuario `empresa` a `/empresa` (y bloquear que un `empresa` entre a `/viajar`/`/conducir`). *Verificación:* logueado como empresa, `/` y las rutas de viaje redirigen a `/empresa`; un conductor/pasajero que entra a `/empresa` es redirigido a su vista.

7. **Server Actions de empresa.** `app/actions/empresa.ts` (nuevo): `agregarConductor(email)` → RPC `agregar_conductor` (devuelve `{ error }` legible); `quitarConductor(id)` → RPC `quitar_conductor`; `getConductores()` → RPC `empresa_conductores`; `getViajesConductor(id)` → RPC `empresa_viajes_conductor`. *Verificación:* `npm run lint` pasa; llamadas tipadas.

8. **Ruta `/empresa` — lista de conductores.** `app/empresa/page.tsx` (Server Component): exige sesión + rol `empresa`; llama `getConductores()` y renderiza la lista (nombre, email, **finalizados del día**, **suma de esas tarifas**) o un estado vacío ("Todavía no agregaste conductores"). Header con "Mi perfil" y "Salir". *Verificación:* la empresa ve sus conductores con las dos métricas; sin conductores, el estado vacío.

9. **Agregar / quitar conductor.** Componente client (`app/empresa/gestion-conductores.tsx` o inline): input de email + botón "Agregar" (llama `agregarConductor`, muestra el error si falla, `router.refresh()` al éxito), y por cada conductor un botón "Quitar" (`quitarConductor` + refresh). *Verificación:* agregar por email suma el conductor a la lista; un email inválido/ajeno muestra el error; quitar lo saca.

10. **Viajes cerrados por conductor.** En la fila de cada conductor, un toggle "Ver viajes" que llama `getViajesConductor(id)` y muestra sus viajes cerrados (origen → destino, fecha, tarifa, badge de estado), reusando el formateo del historial (`fechaCorta`, km, `$`). *Verificación:* se despliegan los viajes cerrados del conductor con su detalle; un conductor sin viajes muestra un vacío claro.

11. **Prueba end-to-end.** Registrar una empresa; registrar dos conductores; agregarlos por email a la empresa; completar viajes con esos conductores; verificar en `/empresa` los conductores, las métricas del día (cantidad + suma correctas, con el corte de día local de Argentina) y los viajes cerrados por conductor; quitar un conductor y verificar que desaparece; confirmar que agregar un conductor de otra empresa / un pasajero / un email inexistente da error; y que la experiencia de pasajero y conductor quedó **igual** (despacho sin cambios). *Verificación:* todos los criterios de aceptación.

## Criterios de aceptación

- [x] El enum `user_role` incluye `'empresa'` y existe la columna `profiles.empresa_id` (nullable, FK a `profiles`).
- [x] Se puede **registrar** una cuenta con rol `empresa`; `handle_new_user` le crea la fila en `profiles`.
- [x] Una empresa completa su perfil con **sólo** `nombre` (nombre de la remisería) y `telefono`; no ve el fieldset de vehículo.
- [x] Logueado como `empresa`, la raíz `/` y las rutas `/viajar` y `/conducir` redirigen a `/empresa`.
- [x] Un `pasajero` o `conductor` que entra a `/empresa` es redirigido a su vista; `/empresa` requiere sesión.
- [x] `agregar_conductor(email)` asocia a un conductor ya registrado a la empresa que llama (setea `empresa_id`).
- [x] `agregar_conductor` tira error legible si: el email no existe, el usuario no es conductor, o el conductor ya pertenece a **otra** empresa.
- [x] Un conductor pertenece a **lo sumo a una** empresa (FK única `empresa_id`).
- [x] `quitar_conductor(id)` sólo funciona para la empresa dueña y devuelve al conductor a independiente (`empresa_id = null`).
- [x] `/empresa` lista los conductores de la empresa con `nombre`, `email`, **cantidad de finalizados del día** y **suma de esas tarifas**.
- [x] Las métricas del día usan el **día local de Argentina** (`America/Argentina/Buenos_Aires`), no UTC.
- [x] La suma se muestra como "suma de tarifas" (o equivalente), **no** como "recaudado".
- [x] Por cada conductor se pueden ver sus **viajes cerrados** (`finalizada`/`cancelada`): origen, destino, fecha, tarifa y badge de estado.
- [x] Una empresa **no** ve conductores ni viajes de otra empresa (las RPC se acotan con `auth.uid()`).
- [x] La experiencia de **pasajero y conductor no cambia**: el despacho y la tarifa funcionan igual que antes (un conductor de empresa se despacha como uno independiente).
- [x] Con la empresa sin conductores, `/empresa` muestra un estado vacío claro.
- [x] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** la empresa es una **fila de `profiles`** con rol `empresa` (el admin *es* la empresa). **No:** una tabla `empresas` aparte con `admin_id`. Reusa el patrón de auth/perfil que ya existe; el "admin" y la "empresa" son la misma entidad. Una tabla aparte agregaría una relación extra sin beneficio en esta capa mínima.
- **Sí:** rol nuevo `empresa` en el enum (`alter type add value`). **No:** un flag booleano o una tabla de roles. Es aditivo, no rompe nada, y mantiene el patrón de rol único por usuario que usa toda la RLS.
- **Sí:** `empresa_id` **nullable** en `profiles` (null = independiente). **No:** una tabla de membresía `empresa_conductores`. Un conductor pertenece a lo sumo a una empresa; una FK simple lo expresa sin una tabla puente. `on delete set null` devuelve los conductores a independientes si se borra la empresa.
- **Sí:** el admin **agrega conductores por email** (conductor ya registrado). **No:** que el conductor elija su empresa al registrarse, ni un flujo de invitación/consentimiento. Es la acción mínima que hace útil la vista; el consentimiento queda para la capa 2.
- **Sí:** si el conductor ya está en otra empresa, **bloquear con error**. **No:** reasignar en silencio. Reasignar sin aviso podría "robar" conductores entre empresas sin intención; el error obliga a que primero lo quiten de la otra.
- **Sí:** acceso cruzado por **RPC `security definer`** (empresa → datos de sus conductores). **No:** policies de select amplias en `profiles`/`trips`. El email vive en `auth.users` (no legible por RLS de todas formas) y el patrón `security definer` acotado con `auth.uid()` es el que ya usan los specs 07/08.
- **Sí:** métricas del día en **hora local de Argentina**. **No:** día UTC. El corte UTC caería ~21hs local y confundiría al usuario sobre "lo de hoy".
- **Sí:** mostrar "**suma de tarifas**", nunca "recaudado". **No:** presentarlo como dinero cobrado. El cobro real es el Spec de pagos; acá la única cifra que existe es la `tarifa_estimada` del Spec 04.
- **Sí:** **no tocar el despacho ni la tarifa**. **No:** despacho de flota o tarifa propia ahora. Son la capa 2 (post-pagos); meterlos acá agranda el spec y acopla con dinero que todavía no existe.
- **Sí:** el conductor **no ve nada** de la empresa en su UI. **No:** mostrarle su remisería en `/perfil`. Mantiene su experiencia intacta y evita superficie extra; mostrarlo es trivial de agregar después si se quiere.
- **Sí:** la remisería es una **sola cuenta** (un admin). **No:** multi-admin por empresa. Simplifica auth y RLS; el multi-admin es capa 2 si aparece la necesidad.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `alter type ... add value 'empresa'` no puede **usarse como valor** en la misma transacción en que se agrega (Postgres): la migración podría fallar si en el mismo script se inserta/compara una fila con ese valor. | El script sólo **agrega** el valor y **crea funciones** que lo referencian (el literal se resuelve en ejecución, no al crear la función); no inserta datos con `role='empresa'`. Si el SQL Editor corriera todo en una transacción y diera error, se ejecuta el `alter type` solo primero y el resto después. Se documenta en las notas de implementación. |
| Las RPC `security definer` leen `auth.users`/`trips` de otros usuarios: un bug en el `where` expondría conductores, emails o viajes de otra empresa. | Todas filtran por `empresa_id = auth.uid()` (o validan pertenencia antes de escribir) y proyectan sólo lo justo (nombre, email, métricas, campos del viaje). Se verifica en el paso end-to-end que una empresa no ve datos de otra. |
| `agregar_conductor` reclama a un conductor **sin su consentimiento**: una empresa podría agregar el email de cualquier conductor. | Es una decisión explícita de la capa mínima (sin invitación). Se acota a conductores **no** pertenecientes a otra empresa (bloquea el "robo"), y `quitar_conductor` permite revertir. El consentimiento es capa 2. |
| El corte "del día" con `at time zone 'America/Argentina/Buenos_Aires'` podría no coincidir con lo que el usuario espera si el servidor/DB está en otra zona. | El cálculo es explícito en la zona de Argentina sobre `cerrado_at` (no depende de la zona del servidor). Se verifica que un viaje finalizado hoy (hora local) cuente y uno de ayer no. |
| Viajes cerrados **antes** de esta migración con `cerrado_at` null (previos al Spec 07) no contarían en "finalizados del día". | Correcto y aceptable: sin `cerrado_at` no hay fecha de cierre confiable para la métrica del día. Igual aparecen en la lista de viajes cerrados por conductor (que cae a `created_at` con `coalesce`). |
| Agregar el rol `empresa` sin cubrir los guards de todas las rutas dejaría a una empresa entrando a `/viajar`/`/conducir` (o viceversa), rompiendo supuestos de esas vistas. | El paso 6 cubre los guards de `/`, `/viajar`, `/conducir`, `/perfil` y `/empresa`; el criterio de aceptación verifica las redirecciones en ambos sentidos. |

## Notas de implementación

Ajustes y confirmaciones hechos durante la implementación:

- **Migración manual, sin transacción.** Se aplica a mano desde el SQL Editor del dashboard (el proyecto no tiene CLI vinculado). El archivo no se envuelve en `BEGIN/COMMIT` porque `alter type ... add value` no puede usarse en la misma transacción en que se agrega. Verificado: pegando el archivo tal cual, corre bien.
- **Registro de empresa depende de la migración.** A diferencia de otros specs, el registro de una empresa **no degrada** sin la migración: `handle_new_user` (Spec 01) castea `role='empresa'::user_role` y falla si el enum aún no tiene ese valor. Hay que aplicar `0009` antes de poder crear cuentas empresa.
- **`Record<UserRole, string>` incompletos.** Agregar `empresa` al enum de TS dejó los `RUTA_POR_ROL` de `app/actions/auth.ts` y `app/actions/perfil.ts` sin la key `empresa` → build roto. Se agregó `empresa: "/empresa"` en ambos.
- **`perfilCompleto` ya cubría empresa.** La lógica existente (exige `nombre`+`telefono`, y vehículo sólo si conductor) ya servía para `empresa`; sólo se documentó el caso, sin rama nueva.
- **`app/page.tsx` pasó de boilerplate a redirect por rol.** La raíz era el template de Next; ahora redirige `pasajero→/viajar`, `conductor→/conducir`, `empresa→/empresa` (el middleware ya garantiza sesión). Los guards de `/viajar` y `/conducir` se corrigieron para mandar a la empresa a `/empresa`.
- **Reputación oculta para empresa.** En `/perfil`, la línea de reputación del Spec 08 se oculta para el rol `empresa` (la reputación es por persona, no por remisería).
- **`/empresa`:** `page.tsx` (server) hace guard + fetch; `gestion-conductores.tsx` (client) tiene el form de agregar por email, el botón Quitar y el toggle "Ver viajes" con carga perezosa (`getViajesConductor`).
- **Guard de auto-agregado.** Tras la prueba, se sumó a `agregar_conductor` un chequeo `v_uid = auth.uid()` → excepción "no podés agregarte a vos mismo", para un mensaje claro cuando la empresa pone su propio email.
- **Consentimiento del conductor: fuera de este spec.** Se confirmó dejar el agregado **directo** por email (reversible con Quitar); el flujo de invitación/aceptación por parte del conductor —marcado como tema de seguridad— va en su **propio spec de capa 2**, no en el 09.
- **Aislamiento entre empresas.** Verificado por la app (no por SQL Editor, donde `auth.uid()` es null): una empresa no ve ni puede reclamar los conductores/viajes de otra; agregar un conductor de otra empresa da "el conductor ya pertenece a otra empresa".

## Capa 2 y relación con pagos (contexto, no se implementa acá)

Este spec es la **capa 1 (propiedad mínima)** de un plan de dos capas. Se documenta la capa 2 acá para no perder el contexto.

**Capa 2 — features de flota (van DESPUÉS del Spec de pagos):**

- Despacho de flota / preferencia de conductores propios de la empresa.
- Dashboards y métricas más allá de "finalizados del día + suma" (rangos, históricos, exportar).
- Tarifa propia de la remisería (hoy la tarifa es única de plataforma).
- Pool de vehículos de la empresa (hoy el vehículo es del conductor, Spec 02).
- Rating/branding de la empresa (hoy la reputación del Spec 08 es por persona).
- Consentimiento/invitación del conductor al ser agregado; multi-admin por empresa.

**Secuencia recomendada:** capa 1 (este spec) → **Spec de pagos**, diseñado con el destinatario del cobro = conductor **o** empresa + comisión → capa 2. El acoplamiento crítico es remiserías↔pagos: el flujo de dinero difiere (pago directo al conductor vs. a la empresa que reparte), así que el Spec de pagos **no** debe diseñarse sin que la empresa exista como posible destinatario — que es justo lo que planta esta capa 1.

## Lo que **no** entra en este spec

- Cobro / comisión / liquidación de la empresa (Spec de pagos).
- Despacho de flota / preferencia de conductores propios.
- Tarifa propia de la remisería.
- Dashboards y métricas más allá de "finalizados del día + suma de esas tarifas".
- Consentimiento/invitación del conductor; multi-admin por empresa.
- Que el conductor vea o cambie su remisería.
- Pool de vehículos de la empresa; rating/branding de la empresa.

Cada uno de esos, si aterriza, va en su propio spec (la mayoría, en la capa 2 descrita arriba).
