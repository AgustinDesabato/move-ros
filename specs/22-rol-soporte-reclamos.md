# SPEC 22 — Rol de soporte y gestión de reclamos

> **Estado:** implementado
> **Depende de:** SPEC 01, SPEC 13
> **Fecha:** 2026-10-05
> **Objetivo:** Que exista un rol `soporte` capaz de ver **todos** los reclamos de **todos** los usuarios (no sólo los propios) y marcarlos como **resueltos** adjuntando una respuesta, cerrando el hueco que el Spec 13 dejó explícitamente fuera de alcance.

El Spec 13 dio de alta la tabla `reclamos` y la pantalla `/perfil/reclamos`, pero cada usuario sólo ve y crea los suyos (RLS por `usuario_id = auth.uid()`), y no hay ninguna vía —ni UI ni rol— para resolverlos: la columna `estado` existe, pero sólo se cambiaba a mano desde el SQL Editor para probar que el listado la reflejaba. Este spec agrega el otro lado del flujo: un rol que atiende el buzón completo de reclamos.

No existe hoy ningún rol de este tipo: `user_role` es `'pasajero' | 'conductor' | 'empresa'` (Spec 01 y Spec 09) y no hay panel de administración (decisión explícita del Spec 01). Este spec agrega `'soporte'` al enum y una pantalla propia (`/soporte`), sin tocar el resto de los roles ni del despacho de viajes.

## Alcance

**Incluye:**

- `user_role` suma el valor `'soporte'` (migración, `alter type ... add value`). Una cuenta se convierte en soporte **a mano**, actualizando `profiles.role` desde el SQL Editor — no hay selector de rol "soporte" en `/registro` (ver Decisiones).
- `reclamos` suma dos columnas: `respuesta` (texto, nula hasta que se resuelve) y `resuelto_at` (marca de tiempo, nula hasta que se resuelve).
- Dos RPC `security definer` en `supabase/migrations/0022_soporte_reclamos.sql`, que son el único camino para leer o resolver reclamos ajenos (no se agrega ninguna policy de RLS nueva sobre `reclamos` ni sobre `profiles`, siguiendo el patrón de `invitaciones` del Spec 11):
  - `reclamos_soporte()`: todos los reclamos (de cualquier usuario), con el nombre y el email de quien lo creó y el origen/destino del viaje si lo hay. Devuelve vacío si quien llama no es `soporte`.
  - `resolver_reclamo(p_reclamo_id, p_respuesta)`: pone `estado = 'resuelto'`, guarda la `respuesta` y `resuelto_at = now()`. Falla si quien llama no es `soporte`, si `p_respuesta` está vacía o si `p_reclamo_id` no existe.
- **Tipos TypeScript** (`lib/supabase/types.ts`): `UserRole` suma `"soporte"`; `Reclamo` suma `respuesta` y `resuelto_at`; tipo nuevo `ReclamoSoporte` (lo que devuelve `reclamos_soporte()`).
- **Server Actions** (`app/actions/reclamos.ts`, extendido): `getReclamosSoporte()` y `resolverReclamo(prevState, formData)`.
- **Pantalla `/soporte`** (`app/soporte/page.tsx` + `resolver-form.tsx`, nuevos): lista todos los reclamos, abiertos primero, cada uno con motivo, descripción, quién lo hizo, viaje asociado (si hay) y fecha; los abiertos tienen un formulario inline **"Resolver"** (respuesta + botón); los resueltos muestran la respuesta ya dada y cuándo.
- **Redirecciones por rol**, igual criterio que `/viajar`, `/conducir` y `/empresa` ya usan entre sí: `app/viajar/page.tsx`, `app/conducir/page.tsx` y `app/empresa/page.tsx` redirigen a `/soporte` si `profile.role === "soporte"`; `/soporte` redirige a la ruta de cada otro rol si no es soporte. `RUTA_POR_ROL` (`app/actions/auth.ts`) e `INICIO`/`ROL` (`app/perfil/page.tsx`) suman la entrada `soporte`.
- **`app/perfil/page.tsx`**: para el rol soporte se ocultan "Historial de viajes", "Contactos de confianza" y "Reclamos" (no aplican: soporte no viaja ni reclama) y no se muestra reputación, mismo criterio que ya usa `esEmpresa`.

**Fuera de alcance (para specs futuros):**

- Selector de rol "soporte" en `/registro`, o cualquier flujo de alta de cuentas de soporte: se crean a mano, igual que no hay panel de administración desde el Spec 01.
- Quién resolvió cada reclamo: no se guarda `resuelto_por`; cualquier cuenta de soporte puede resolver cualquier reclamo y no queda registro de cuál lo hizo.
- Reabrir un reclamo ya resuelto.
- Notificar al usuario (push/email) cuando se resuelve su reclamo.
- Filtros, búsqueda o paginación en `/soporte`: lista completa, sin acotar por fecha, usuario ni rol del reclamante.
- Asignar reclamos a una cuenta de soporte puntual o niveles de soporte (supervisor, etc.).
- Editar o borrar una respuesta ya dada.
- Un `CHECK` en la base que exija `respuesta is not null` cuando `estado = 'resuelto'` (ver Decisiones).
- Cualquier cambio al despacho de viajes, pagos o calificaciones.

## Modelo de datos

Migración `supabase/migrations/0022_soporte_reclamos.sql`. Idempotente, se aplica a mano desde el SQL Editor del dashboard, como las anteriores.

### Rol nuevo y columnas nuevas

```sql
alter type public.user_role add value if not exists 'soporte';

alter table public.reclamos add column if not exists respuesta   text;
alter table public.reclamos add column if not exists resuelto_at timestamptz;
```

Sin `CHECK` que ate `respuesta`/`resuelto_at` a `estado = 'resuelto'`: ya existen reclamos marcados `resuelto` a mano desde las pruebas del Spec 13, sin respuesta ni fecha; un `CHECK` los dejaría sin forma de pasar la migración sin inventarles un valor. La regla ("no se resuelve sin respuesta") queda sólo en `resolver_reclamo()`, para toda resolución **nueva**.

Sin policy de RLS nueva en `reclamos` ni en `profiles`: el acceso cruzado (soporte leyendo/editando reclamos de cualquier usuario) va entero por las dos RPC de abajo, como ya hacen `invitar_conductor`/`empresa_invitaciones`/`mis_invitaciones` (Spec 11) para el acceso cruzado empresa↔conductor.

### RPC `reclamos_soporte()`

```sql
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
```

Quien no es `soporte` recibe una lista vacía (mismo estilo que `empresa_invitaciones`/`mis_invitaciones`: el filtro de rol/dueño va en el `where`, sin lanzar excepción porque es una lectura).

### RPC `resolver_reclamo(p_reclamo_id, p_respuesta)`

```sql
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
```

El chequeo de rol usa `is distinct from` y no `<>`: sin sesión (`auth.uid()` nulo) el rol da `NULL`, y con `<>` la comparación da `NULL` y el `if` no corta. La 0022 se escribió con `<>`; la migración `0026_resolver_reclamo_sin_sesion.sql` redefine la función con la forma de arriba.

Resolver un reclamo ya resuelto simplemente lo vuelve a resolver (pisa `respuesta` y `resuelto_at`); no hay bloqueo ni aviso de "ya estaba resuelto" (ver Riesgos).

### Tipos TypeScript (`lib/supabase/types.ts`, extendido)

```ts
export type UserRole = "pasajero" | "conductor" | "empresa" | "soporte";

export type Reclamo = {
  id: string;
  usuario_id: string;
  trip_id: string | null;
  motivo: string;
  descripcion: string;
  estado: ReclamoEstado;
  respuesta: string | null;
  resuelto_at: string | null;
  created_at: string;
};

// Un reclamo tal como lo devuelve reclamos_soporte(): con quién lo creó y,
// si hay, el viaje asociado. Sólo lo puede pedir una cuenta con role = 'soporte'.
export type ReclamoSoporte = {
  id: string;
  usuario_id: string;
  nombre_usuario: string | null;
  email: string;
  trip_id: string | null;
  origen_label: string | null;
  destino_label: string | null;
  motivo: string;
  descripcion: string;
  estado: ReclamoEstado;
  respuesta: string | null;
  resuelto_at: string | null;
  created_at: string;
};
```

### Server Actions (`app/actions/reclamos.ts`, extendido)

```ts
export async function getReclamosSoporte(): Promise<ReclamoSoporte[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("reclamos_soporte");
  return (data as ReclamoSoporte[] | null) ?? [];
}

export type ResolverReclamoState = { error: string } | undefined;

export async function resolverReclamo(
  _prevState: ResolverReclamoState,
  formData: FormData,
): Promise<ResolverReclamoState> {
  const reclamoId = (formData.get("reclamo_id") ?? "").toString();
  const respuesta = (formData.get("respuesta") ?? "").toString().trim();
  if (respuesta.length < 10) {
    return { error: "Escribí una respuesta de al menos 10 caracteres." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("resolver_reclamo", {
    p_reclamo_id: reclamoId,
    p_respuesta: respuesta,
  });
  if (error) {
    return { error: "No se pudo resolver el reclamo. Intentá de nuevo." };
  }

  revalidatePath("/soporte");
  revalidatePath("/perfil/reclamos");
}
```

El mínimo de 10 caracteres copia el que ya usa `crearReclamo` para la descripción (Spec 13).

### Redirecciones por rol

`app/actions/auth.ts`:

```ts
const RUTA_POR_ROL: Record<UserRole, string> = {
  pasajero: "/viajar",
  conductor: "/conducir",
  empresa: "/empresa",
  soporte: "/soporte",
};
```

`app/perfil/page.tsx`:

```ts
const INICIO: Record<UserRole, string> = {
  pasajero: "/viajar",
  conductor: "/conducir",
  empresa: "/empresa",
  soporte: "/soporte",
};

const ROL: Record<UserRole, string> = {
  pasajero: "Pasajero",
  conductor: "Conductor",
  empresa: "Remisería",
  soporte: "Soporte",
};
```

`app/viajar/page.tsx`, `app/conducir/page.tsx` y `app/empresa/page.tsx` suman `if (profile.role === "soporte") redirect("/soporte");`, igual que ya se redirigen entre sí.

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Commit 1 — este spec.** `specs/22-rol-soporte-reclamos.md`.

2. **Migración.** `supabase/migrations/0022_soporte_reclamos.sql`: valor `soporte` del enum, columnas `respuesta`/`resuelto_at`, RPC `reclamos_soporte()` y `resolver_reclamo()`. Aplicarla en Supabase y, a mano, pasar una cuenta existente a `role = 'soporte'`. *Verificación (SQL Editor):* `reclamos_soporte()` devuelve vacío con una cuenta que no es soporte y todos los reclamos (de cualquier usuario) con la cuenta de soporte; `resolver_reclamo` con respuesta vacía o `p_reclamo_id` inexistente falla; con datos válidos deja `estado = 'resuelto'`, `respuesta` y `resuelto_at` seteados.

3. **Tipos + Server Actions.** `lib/supabase/types.ts` (+`soporte` en `UserRole`, `respuesta`/`resuelto_at` en `Reclamo`, tipo `ReclamoSoporte`); `app/actions/reclamos.ts` (+`getReclamosSoporte`, `resolverReclamo`). *Verificación:* `npm run build` compila.

4. **Pantalla `/soporte` y redirecciones.** `app/soporte/page.tsx` + `resolver-form.tsx` (nuevos); redirecciones cruzadas en `app/viajar/page.tsx`, `app/conducir/page.tsx`, `app/empresa/page.tsx`; `RUTA_POR_ROL` (`app/actions/auth.ts`) e `INICIO`/`ROL` (`app/perfil/page.tsx`) con la entrada `soporte`; en `app/perfil/page.tsx`, ocultar "Historial de viajes", "Contactos de confianza" y "Reclamos" para `esSoporte`. *Verificación:* `npm run lint` pasa; ver Caso de prueba.

5. **Prueba end-to-end.** Ver "Caso de prueba". *Verificación:* todos los criterios de aceptación, más `npm run build` y `npm run lint`.

## Caso de prueba

Precondición: `npm run dev` en `http://localhost:3000`, migración 0022 aplicada, una cuenta con `role = 'soporte'` (S) y una cuenta pasajero (P) con al menos un reclamo abierto creado desde `/perfil/reclamos`.

| # | Paso | Resultado esperado |
| --- | --- | --- |
| 1 | Loguearse como S. | Redirige a `/soporte`, no a `/viajar`. |
| 2 | En `/soporte`, ver la lista. | Aparece el reclamo de P (motivo, descripción, nombre o email de P, fecha), marcado "Abierto", con un formulario "Resolver". |
| 3 | En ese formulario, enviar sin escribir respuesta. | Error "Escribí una respuesta de al menos 10 caracteres.", no se marca resuelto. |
| 4 | Escribir una respuesta de 15 caracteres y enviar. | El reclamo pasa a "Resuelto" en la misma lista, sin recargar la página completa, mostrando la respuesta. |
| 5 | Loguearse como P y abrir `/perfil/reclamos`. | El reclamo aparece como "Resuelto". |
| 6 | Loguearse como un pasajero Q sin reclamos propios y, por la URL, entrar a `/soporte`. | Redirige a `/viajar` (Q no es soporte). |
| 7 | Como S, abrir `/perfil`. | No aparecen "Historial de viajes", "Contactos de confianza" ni "Reclamos"; el rol mostrado es "Soporte". |
| 8 | En el SQL Editor, logueado como P, llamar a `select * from reclamos_soporte();`. | Devuelve 0 filas (P no es soporte). |

## Criterios de aceptación

- [ ] `user_role` incluye `'soporte'`; una cuenta sólo llega a ese rol actualizando `profiles.role` a mano (no hay selector en `/registro`).
- [ ] `reclamos_soporte()` devuelve todos los reclamos de todos los usuarios cuando quien llama es `soporte`, y una lista vacía si no lo es.
- [ ] `resolver_reclamo(id, respuesta)` exige `soporte`, respuesta no vacía y un `id` existente; en éxito deja `estado = 'resuelto'`, guarda `respuesta` y `resuelto_at`.
- [ ] `/soporte` lista todos los reclamos (abiertos primero), cada uno con quién lo hizo, motivo, descripción, viaje asociado si hay y fecha; los abiertos tienen un formulario para resolver con una respuesta de al menos 10 caracteres; al resolver, el reclamo pasa a "Resuelto" sin recargar la página completa y queda visible para el usuario que lo creó en `/perfil/reclamos`.
- [ ] Loguearse como `soporte` redirige a `/soporte`; loguearse con otro rol y entrar a `/soporte` por la URL redirige a la ruta de ese rol.
- [ ] En `/perfil`, una cuenta `soporte` no ve "Historial de viajes", "Contactos de confianza" ni "Reclamos", y su rol se muestra como "Soporte".
- [ ] Un usuario que no es `soporte` no puede leer ni resolver reclamos ajenos, ni por la pantalla ni llamando a las RPC directamente.
- [ ] El despacho de viajes, los pagos y las calificaciones no cambian.
- [ ] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** rol `soporte` nuevo en el enum, asignado a mano desde el SQL Editor. **No:** un selector de rol en `/registro` ni ningún flujo de alta. Igual que "no hay panel de administración" (decisión del Spec 01): crear una cuenta de soporte es una operación de infraestructura, no un flujo de producto que cualquiera pueda elegir al registrarse.
- **Sí:** acceso cruzado (soporte leyendo/resolviendo reclamos ajenos) sólo por dos RPC `security definer`. **No:** una policy de RLS nueva en `reclamos` ni en `profiles`. Mismo patrón que `invitar_conductor`/`empresa_invitaciones`/`mis_invitaciones` del Spec 11: el acceso entre cuentas distintas va por función con el chequeo de rol adentro, no ampliando qué puede ver cada policy.
- **Sí:** `reclamos_soporte()` devuelve vacío si quien llama no es soporte (no lanza excepción). **No:** una excepción como en `resolver_reclamo`. Es una lectura, como `empresa_invitaciones`/`mis_invitaciones`; una lista vacía es indistinguible en la UI de "sin reclamos" y no hace falta tratarla como error.
- **Sí:** `resolver_reclamo` exige una `respuesta` no vacía (mínimo 10 caracteres, igual que la descripción del Spec 13). **No:** permitir marcar "resuelto" sin explicar nada. El objetivo del spec es "marcarlos como resueltos **con una respuesta**", no sólo cambiar el estado.
- **No:** `CHECK` en la base que exija `respuesta is not null` cuando `estado = 'resuelto'`. Ya hay reclamos resueltos a mano sin respuesta de las pruebas del Spec 13; la migración tendría que abortar o inventarles un valor. La regla queda sólo en `resolver_reclamo()` para las resoluciones nuevas.
- **Sí:** columna `resuelto_at`, igual criterio que `resuelta_at` en `invitaciones` (Spec 11). **No:** reusar `created_at` para "cuándo se resolvió".
- **No:** guardar qué cuenta de soporte resolvió cada reclamo (`resuelto_por`). No se pidió trazabilidad entre agentes de soporte; con una sola categoría de rol alcanza, y agregarla es una decisión de producto no pedida.
- **Sí:** `/soporte` es un único panel con todos los reclamos, sin filtros ni paginación. **No:** una pantalla de detalle por reclamo ni búsqueda. El volumen esperado en el MVP es bajo; el panel único ya es el patrón que usa `/empresa` (Spec 09/17).
- **Sí:** cualquier reclamo —propio de otro usuario, de un pasajero, conductor o empresa— es visible y resoluble por soporte sin restricción adicional. **No:** acotar por zona, rol del reclamante o relación con quien resuelve. No se pidió segmentar soporte; es un rol único que ve todo el buzón.
- **Sí:** ocultar en `/perfil` las opciones que no aplican a soporte ("Historial de viajes", "Contactos de confianza", "Reclamos"), mismo criterio que ya aplica `esEmpresa` a "Historial de viajes". **No:** mostrarlas igual con la etiqueta "Próximamente". Soporte no viaja ni reclama; dejarlas visibles sería un atajo a una pantalla que no le sirve.
- **Sí:** chequear el rol en `resolver_reclamo` con `is distinct from 'soporte'`. **No:** `<> 'soporte'`. Se cambió después de la implementación (migración 0026): con `<>`, una llamada sin sesión pasaba el chequeo porque el rol nulo no dispara la excepción. Es la forma que ya usa `estadisticas_empresa()` (Spec 17).
- **Sí:** el `alter type ... add value 'soporte'` se ejecuta solo, antes del resto de la 0022. **No:** todo el archivo en una sola ejecución. Postgres no deja usar un valor de enum en la misma transacción en la que se agrega, y el SQL Editor corre todo lo pegado en una sola.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Alguien actualiza `profiles.role` de la cuenta equivocada a `'soporte'` desde el SQL Editor. | Requiere acceso al dashboard de Supabase, el mismo nivel de confianza que crear o modificar cualquier policy; no hay flujo de producto que lo permita. |
| Dos cuentas de soporte resuelven el mismo reclamo casi al mismo tiempo. | `resolver_reclamo` pisa `estado`/`respuesta`/`resuelto_at` sin bloqueo; gana la última llamada. Aceptable para el volumen esperado; no hay UI que indique "alguien lo está resolviendo". |
| `reclamos_soporte()` devuelve vacío para una cuenta que sí es soporte porque `profiles.role` no quedó bien escrito a mano. | El criterio de aceptación #2 se verifica con una cuenta de soporte real antes de dar por cerrado el spec. |
| El join a `auth.users` en `reclamos_soporte()` deja de ser válido si cambia el esquema de auth de Supabase. | Mismo join que ya usan `empresa_invitaciones()`/`mis_invitaciones()` (Spec 11) desde hace varios specs; si se rompe, se rompe para ambas a la vez y se nota enseguida. |
| Sin `respuesta is not null` como `CHECK`, un futuro `update` manual deja `estado = 'resuelto'` sin respuesta. | Aceptado (ver Decisiones); el listado de `/soporte` simplemente no muestra respuesta para esas filas. |

## Lo que **no** entra en este spec

- Selector de rol "soporte" en `/registro` o cualquier alta de cuentas de soporte.
- Quién resolvió cada reclamo (`resuelto_por`).
- Reabrir un reclamo resuelto.
- Notificaciones al resolver un reclamo.
- Filtros, búsqueda o paginación en `/soporte`.
- Niveles de soporte o asignación de reclamos a una cuenta puntual.
- Editar o borrar una respuesta ya dada.
- `CHECK` en la base atando `respuesta`/`resuelto_at` a `estado = 'resuelto'`.

Cada uno de esos, si aterriza, va en su propio spec.
