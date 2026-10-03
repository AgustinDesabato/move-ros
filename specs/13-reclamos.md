# SPEC 13 — Reclamos

> **Estado:** implementado
> **Depende de:** SPEC 01, SPEC 04, SPEC 07
> **Fecha:** 2026-09-30
> **Objetivo:** Cubrir la opción **"Reclamos"** del menú de usuario (P10) dándole a cualquier usuario (pasajero, conductor o empresa) una vía para reportar un problema —ligado o no a un viaje puntual— y hacerle seguimiento desde su perfil viendo si cada reclamo sigue **abierto** o ya está **resuelto**.

Hoy `/perfil` (Spec 02/09/11/12) ya tiene una entrada "Reclamos" marcada **"Próximamente"**. Este spec cierra esa punta: agrega el alta y el listado de reclamos del usuario, y un atajo desde el historial de viajes (`app/viajes/fila-viaje.tsx`, Spec 07) para reportar un problema con el viaje ya cargado —sin tocar el despacho, los pagos ni las calificaciones.

## Alcance

**Incluye:**

- Migración SQL `supabase/migrations/0015_reclamos.sql` (idempotente):
  - Tabla nueva `public.reclamos` (`usuario_id`, `trip_id` **opcional**, `motivo`, `descripcion`, `estado` `'abierto' | 'resuelto'` con default `'abierto'`, `created_at`), con RLS: cada usuario **lee y crea sólo los suyos** (`auth.uid() = usuario_id`); si `trip_id` no es nulo, sólo se puede crear el reclamo si ese viaje es propio (pasajero **o** conductor del viaje). Sin `update`/`delete` para el usuario (resolver un reclamo es una capa de gestión que no está definida todavía; ver Decisiones).
- **Tipos TypeScript** (`lib/supabase/types.ts`, extendido): `ReclamoEstado`, `Reclamo`, `ReclamoConViaje`.
- **Server Actions** (`app/actions/reclamos.ts`, nuevo): `getReclamos()` (los reclamos del usuario, con el origen/destino del viaje asociado si lo hay) y `crearReclamo(prevState, formData)` (valida motivo y descripción, mismo patrón que `agregarContacto`).
- **Pantalla `/perfil/reclamos`** (`app/perfil/reclamos/page.tsx` + `reclamo-form.tsx`, nuevos): lista "mis reclamos" con motivo, fecha, viaje asociado (si hay) y una etiqueta de estado (**Abierto** / **Resuelto**), y debajo el formulario **"Reportar un problema"** (motivo + descripción, viaje opcional). En `app/perfil/page.tsx`, la entrada **"Reclamos"** deja de decir "Próximamente" y pasa a linkear ahí.
- **`app/viajes/fila-viaje.tsx`**: cada fila del historial suma un botón **"Reportar un problema"** que despliega el mismo formulario (`ReclamoForm`) con el viaje de esa fila ya cargado (`trip_id` oculto + origen/destino como contexto visible); al enviarlo con éxito, el formulario se cierra solo.

**Fuera de alcance (para specs futuros):**

- Resolver un reclamo (marcarlo `resuelto`) desde cualquier pantalla: no hay UI de gestión para el usuario, la remisería ni un rol de soporte/admin. La columna `estado` existe y se puede pasar a `'resuelto'` a mano (SQL Editor) para probar que el listado lo refleja, pero ese flujo de resolución es un spec aparte (igual que "gestionar alertas de emergencia" quedó fuera del Spec 12).
- Adjuntar fotos o archivos al reclamo.
- Categorías/motivos predefinidos (select con opciones fijas): `motivo` es texto libre, como un asunto corto. No se pidió una taxonomía y agregar una inventaría una categorización no solicitada.
- Notificar a nadie (push, email) cuando se crea o resuelve un reclamo.
- Editar o borrar un reclamo ya creado.
- Reclamos contra un usuario puntual (por ejemplo "contra el conductor X"): el reclamo se liga como máximo a un viaje, no a una contraparte específica.

## Modelo de datos

Migración `supabase/migrations/0015_reclamos.sql`. Idempotente, se aplica a mano desde el SQL Editor del dashboard, como las anteriores.

### Tabla nueva `reclamos`

```sql
create table if not exists public.reclamos (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references public.profiles(id) on delete cascade,
  trip_id     uuid references public.trips(id) on delete set null,
  motivo      text not null,
  descripcion text not null,
  estado      text not null default 'abierto' check (estado in ('abierto', 'resuelto')),
  created_at  timestamptz not null default now()
);

create index if not exists reclamos_usuario_idx on public.reclamos (usuario_id);
create index if not exists reclamos_trip_idx    on public.reclamos (trip_id);

alter table public.reclamos enable row level security;

drop policy if exists "El usuario ve sus reclamos" on public.reclamos;
create policy "El usuario ve sus reclamos"
  on public.reclamos for select
  using (auth.uid() = usuario_id);

-- El trip_id es opcional; si viene, tiene que ser un viaje propio (como
-- pasajero o como conductor) — no se puede reclamar sobre un viaje ajeno.
drop policy if exists "El usuario crea sus reclamos" on public.reclamos;
create policy "El usuario crea sus reclamos"
  on public.reclamos for insert
  with check (
    auth.uid() = usuario_id
    and (
      trip_id is null
      or exists (
        select 1 from public.trips t
         where t.id = trip_id
           and (t.pasajero_id = auth.uid() or t.conductor_id = auth.uid())
      )
    )
  );
```

Sin policy de `update` ni `delete`: un reclamo, una vez creado, no se edita ni se borra desde el cliente (ver Decisiones).

### Tipos TypeScript (`lib/supabase/types.ts`, extendido)

```ts
export type ReclamoEstado = "abierto" | "resuelto";

export type Reclamo = {
  id: string;
  usuario_id: string;
  trip_id: string | null;
  motivo: string;
  descripcion: string;
  estado: ReclamoEstado;
  created_at: string;
};

// Un reclamo tal como lo devuelve getReclamos(), con el origen/destino del
// viaje asociado (null si el reclamo no está ligado a ningún viaje).
export type ReclamoConViaje = Reclamo & {
  trips: { origen_label: string; destino_label: string } | null;
};
```

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Spec.** Este documento (`specs/13-reclamos.md`). *Verificación:* revisión del alcance.
2. **Migración.** Escribir y ejecutar `supabase/migrations/0015_reclamos.sql`: tabla `reclamos` con su índice y RLS. *Verificación (SQL Editor):* un usuario inserta/lee sólo sus propios reclamos; insertar un reclamo con `trip_id` de un viaje ajeno falla por RLS; insertar con `trip_id` `null` funciona; insertar con un `estado` fuera de `'abierto'/'resuelto'` falla por el `check`.
3. **Tipos + Server Actions + pantalla `/perfil/reclamos`.** `lib/supabase/types.ts` (+`ReclamoEstado`, `Reclamo`, `ReclamoConViaje`); `app/actions/reclamos.ts` (nuevo: `getReclamos`, `crearReclamo`); `app/perfil/reclamos/page.tsx` + `reclamo-form.tsx` (nuevos); `app/perfil/page.tsx` (la entrada "Reclamos" pasa de "Próximamente" a `href="/perfil/reclamos"`). *Verificación:* `npm run lint` pasa; desde `/perfil` se entra a `/perfil/reclamos`, se crea un reclamo sin viaje (aparece en la lista con estado "Abierto") y motivo/descripción vacíos muestran error sin guardar.
4. **Botón en `fila-viaje.tsx`.** Cada fila del historial suma "Reportar un problema"; al tocarlo se despliega `ReclamoForm` con `trip_id` de esa fila oculto en el formulario y el origen/destino mostrados como contexto de sólo lectura; al enviarse con éxito el formulario se cierra. *Verificación:* desde `/viajes`, reportar un problema sobre una fila crea un reclamo con ese `trip_id`, visible luego en `/perfil/reclamos` con el origen/destino de ese viaje.
5. **Prueba end-to-end.** Como pasajero: entrar a `/perfil/reclamos` y crear un reclamo sin viaje asociado (motivo + descripción) — aparece en la lista como "Abierto". Ir a `/viajes`, tocar "Reportar un problema" en una fila y enviarlo — aparece en `/perfil/reclamos` con el origen/destino de ese viaje. Marcar ese reclamo como `'resuelto'` a mano desde el SQL Editor y refrescar `/perfil/reclamos`: la etiqueta pasa a "Resuelto". *Verificación:* todos los criterios de aceptación.

## Criterios de aceptación

- [ ] Existe la tabla `public.reclamos` con RLS activa.
- [ ] Un usuario sólo puede leer/crear sus propios `reclamos` (RLS por `usuario_id = auth.uid()`); no hay policy de `update` ni `delete`.
- [ ] Crear un reclamo con `trip_id` de un viaje ajeno falla por RLS; con `trip_id` `null` funciona; con un viaje propio (como pasajero o como conductor) funciona.
- [ ] En `/perfil`, la entrada "Reclamos" ya no dice "Próximamente" y lleva a `/perfil/reclamos`.
- [ ] `/perfil/reclamos` lista los reclamos del usuario logueado (motivo, fecha, viaje asociado si lo hay, estado); el formulario "Reportar un problema" valida motivo y descripción no vacíos y agrega el reclamo sin recargar la página completa.
- [ ] Un usuario no ve ni puede crear reclamos a nombre de otro usuario.
- [ ] En el historial (`/viajes`), cada fila tiene un botón "Reportar un problema" que despliega el formulario con el `trip_id` de esa fila ya cargado (sin que el usuario tenga que tipearlo ni elegirlo); al enviarse, el reclamo queda visible en `/perfil/reclamos` con el origen/destino de ese viaje.
- [ ] Un reclamo con `estado = 'resuelto'` (cambiado a mano en la base) se muestra como "Resuelto" en `/perfil/reclamos`; uno recién creado se muestra como "Abierto".
- [ ] El despacho de viajes (P05/P06), los pagos (Spec 10) y las calificaciones (Spec 08) no cambian.
- [ ] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** una tabla `reclamos` con RLS directa (`auth.uid() = usuario_id`), **sin** RPC `security definer`. **No:** el patrón de RPC que usan Spec 08/09/11. Como en `contactos_confianza` (Spec 12), cada usuario gestiona sólo sus propias filas: RLS directa alcanza.
- **Sí:** `trip_id` **opcional** y validado contra viajes propios (pasajero **o** conductor) en el `with check` del insert. **No:** exigir siempre un viaje. El objetivo explícito del spec es cubrir reclamos "ligados o no a un viaje"; y como cualquier rol puede reclamar (no sólo el pasajero), el viaje propio se valida contra ambas puntas de `trips`.
- **Sí:** sin policy de `update`/`delete`: un reclamo creado queda fijo del lado del usuario. **No:** una pantalla para editar o retirar un reclamo. El checklist pide "reportar" y "seguir" (ver estado), no editar; resolver el reclamo es tarea de quien lo atiende, no del usuario que lo creó, y esa gestión queda fuera de este spec (ver Alcance).
- **Sí:** `motivo` es texto libre (como un asunto corto), sin una lista fija de categorías. **No:** un `select` con motivos predefinidos. El checklist no pidió una taxonomía; inventar categorías es una decisión de producto que no está pedida y que además requeriría decidir qué hacer si ninguna categoría encaja.
- **Sí:** `ReclamoForm` es un único componente reusado tanto en `/perfil/reclamos` (sin viaje precargado) como en `fila-viaje.tsx` (con `trip_id` oculto y el viaje como contexto). **No:** dos formularios separados. Son el mismo alta con el mismo `trip_id` opcional; la única diferencia es si ese campo ya viene cargado o no.
- **Sí:** sin mecanismo para resolver reclamos en este spec (la columna `estado` existe pero sólo se cambia a mano en la base para las pruebas). **No:** un panel de soporte/admin. Igual que `alertas_emergencia` en el Spec 12, el spec pide registrar y —acá además— "seguir el estado", no gestionar quién lo resuelve ni cómo; eso merece su propio spec cuando se defina qué rol atiende los reclamos.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| **Reclamos "huérfanos":** si se borra un `trip_id` referenciado, el reclamo podría perder contexto. | `trip_id` usa `on delete set null` (no `cascade`): el reclamo sobrevive aunque el viaje se borre; sólo pierde el vínculo, no el contenido. |
| **RLS del insert demasiado laxa/estricta:** un bug en el `exists (...)` podría permitir reclamar sobre viajes ajenos, o bloquear reclamos legítimos de un conductor. | El `with check` valida `t.pasajero_id = auth.uid() or t.conductor_id = auth.uid()` sobre el mismo `trip_id` insertado; se verifica en el paso 2 (SQL Editor) con ambos roles antes de tocar el front. |
| **Formulario sin viaje rompiendo el join de `getReclamos()`.** | El join a `trips` es opcional (`trip_id` nullable); si es `null`, la fila del listado muestra el reclamo sin bloque de viaje, sin romper el resto de la lista. |

## Lo que **no** entra en este spec

- Resolver reclamos (UI de soporte/admin, cambio de estado desde el cliente).
- Adjuntar archivos o fotos al reclamo.
- Categorías de motivo predefinidas.
- Notificaciones al crear o resolver un reclamo.
- Editar o borrar un reclamo existente.
- Reclamos contra un usuario puntual (más allá del viaje asociado).
