# SPEC 30 — Salir de la remisería por cuenta propia

> **Estado:** aprobado
> **Depende de:** SPEC 09, SPEC 10, SPEC 11
> **Fecha:** 2026-10-07
> **Objetivo:** Que el conductor se desvincule solo de su remisería desde `/perfil`, con confirmación en línea y sin poder hacerlo mientras tiene un viaje aceptado o en curso.

El Spec 11 dejó explícitamente fuera "salir por cuenta propia": hoy sólo la remisería desvincula a un conductor, con `quitar_conductor` (Spec 09). El conductor ve en `/perfil` la línea "Tu remisería: X", pero no puede hacer nada con ella.

Este spec agrega la salida desde el lado del conductor. Además cierra un hueco que la hace eludible: la policy "Los usuarios editan su propio perfil" (`0001_profiles.sql`) deja actualizar cualquier columna de la propia fila, así que hoy un conductor puede escribir `profiles.empresa_id` directamente por la API: ponerlo en `null` (salir sin ningún control) o ponerle el id de cualquier remisería (entrar sin invitación, salteando el consentimiento del Spec 11, y desviando sus cobros a esa remisería).

## Alcance

**Incluye:**

- **Migración** `supabase/migrations/0030_salir_remiseria.sql` (idempotente):
  - RPC `salir_de_empresa()` (`security definer`): el conductor que llama pasa a independiente (`empresa_id = null`). Rechaza si quien llama no es conductor, si no pertenece a una remisería o si tiene un viaje `aceptada` o `en_curso`.
  - Trigger `profiles_empresa_id_protegida` (`before update` en `profiles`): rechaza cualquier cambio de `empresa_id` hecho directamente por un usuario (`current_user` `authenticated` o `anon`). Las RPC `security definer` (`aceptar_invitacion`, `quitar_conductor`, `salir_de_empresa`) siguen pudiendo cambiarlo porque corren como el dueño de la función.
- **Server Action** `salirDeEmpresa()` en `app/actions/invitaciones.ts`: llama a la RPC y revalida `/perfil`.
- **UI** en `app/perfil/invitaciones-conductor.tsx`: la tarjeta "Tu remisería: X" suma el botón "Salir de la remisería". Al tocarlo, la misma tarjeta pasa a la confirmación en línea; al confirmar, el conductor queda independiente y la tarjeta desaparece.

**Fuera de alcance (para specs futuros):**

- Avisar a la remisería que el conductor se fue (no hay notificaciones en el MVP).
- Guardar la fecha de salida o un historial de pertenencia. El Spec 17 ya anota que no se guarda cuándo se quitó a un conductor; tampoco se guarda acá.
- Bloquear `quitar_conductor` (lado remisería) con un viaje activo.
- Un período de preaviso o una salida que requiera aprobación de la remisería.
- Proteger otras columnas de `profiles` contra la escritura directa (por ejemplo `role`).

## Modelo de datos

Sin tablas ni columnas nuevas. Cambia sólo quién puede escribir `profiles.empresa_id`.

### Migración `0030_salir_remiseria.sql`

Idempotente, se aplica a mano desde el SQL Editor del dashboard y se puede pegar entera en una sola ejecución.

```sql
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
```

Ningún código de la app escribe `empresa_id` directamente (los `update` sobre `profiles` tocan `nombre`, `telefono`, `alias_cvu`, `last_seen_at` y `en_linea`), así que el trigger no rompe nada existente.

### Server Action (`app/actions/invitaciones.ts`, extendido)

```ts
// El conductor sale de su remisería y queda independiente (RPC salir_de_empresa).
// La RPC rechaza con un mensaje legible si tiene un viaje aceptado o en curso.
export async function salirDeEmpresa(): Promise<InvitacionState>
```

Mismo patrón que `aceptarInvitacion`: `getUser()` → `redirect("/login")` si no hay sesión, `rpc("salir_de_empresa")`, devuelve `{ error }` con `error.message` (o "No se pudo salir de la remisería." si viene vacío) y `revalidatePath("/perfil")`.

### UI (`app/perfil/invitaciones-conductor.tsx`)

La tarjeta "Tu remisería" pasa a ser un Client Component con dos estados:

| Estado | Contenido |
| --- | --- |
| Normal | "Tu remisería: **X**" y el botón "Salir de la remisería" (texto en color `peligro`). |
| Confirmando | "¿Seguro que querés salir de **X**? Vas a quedar como conductor independiente." con "Cancelar" (vuelve al estado normal) y "Salir" (llama a `salirDeEmpresa`). Ambos deshabilitados mientras la action corre. |

Si la action devuelve error, se muestra con `MensajeError` debajo, la tarjeta queda en el estado normal y el conductor sigue vinculado. Si sale bien, `router.refresh()`: `getMiEmpresa()` devuelve `null` y la tarjeta desaparece.

No se usan diálogos del navegador (`confirm`).

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Commit 1 — este spec.** `specs/30-salir-de-remiseria.md`.

2. **Migración.** `supabase/migrations/0030_salir_remiseria.sql` y aplicarla en Supabase. *Verificación (SQL Editor):* corre dos veces sin error; filas 6 y 7 del caso de prueba.

3. **Action y UI.** `salirDeEmpresa()` en `app/actions/invitaciones.ts` y la tarjeta con confirmación en `app/perfil/invitaciones-conductor.tsx`. *Verificación:* filas 1 a 5 del caso de prueba; `npm run lint` y `npm run build` pasan.

4. **Prueba end-to-end.** Ver "Caso de prueba". *Verificación:* todos los criterios de aceptación.

## Caso de prueba

Precondición: `npm run dev` corriendo en `http://localhost:3000`, migración 0030 aplicada, un conductor (C) que pertenece a la remisería (E) con al menos un viaje finalizado para E, y un pasajero (P).

| # | Paso | Resultado esperado |
| --- | --- | --- |
| 1 | Como C, abrir `/perfil` y tocar "Salir de la remisería". | La tarjeta pasa a "¿Seguro que querés salir de E? …" con "Cancelar" y "Salir". C sigue vinculado. |
| 2 | Tocar "Cancelar". | Vuelve a "Tu remisería: E" con el botón. Nada cambió. |
| 3 | Como P, pedir un viaje y que C lo acepte. Como C, en `/perfil`, "Salir de la remisería" → "Salir". | Error "Terminá tu viaje en curso antes de salir de la remisería.". C sigue en E. |
| 4 | Finalizar el viaje del paso 3. Como C, "Salir de la remisería" → "Salir". | La tarjeta desaparece. Ese viaje quedó cobrado para E (se finalizó antes de salir). |
| 5 | Como E, abrir `/empresa`. | C aparece como ex conductor (sin botón "Quitar"), con sus cifras y viajes para E. |
| 6 | En el SQL Editor, como C (`set local role authenticated` + claims de C), `update profiles set empresa_id = '{E}' where id = '{C}'`. | Error "empresa_id sólo se cambia con invitaciones o saliendo de la remisería". |
| 7 | Como E, invitar de nuevo a C; como C, aceptar en `/perfil`. | C vuelve a E: el trigger no bloquea `aceptar_invitacion`. Como E, "Quitar" a C también funciona. |
| 8 | Como C ya independiente, llamar a `salir_de_empresa()`. | Error "no pertenecés a ninguna remisería". |

## Criterios de aceptación

- [ ] Un conductor vinculado ve "Salir de la remisería" en la tarjeta "Tu remisería" de `/perfil`; uno independiente no ve la tarjeta.
- [ ] Tocar el botón pide confirmación en la misma tarjeta, sin diálogos del navegador; "Cancelar" no cambia nada.
- [ ] Al confirmar, `profiles.empresa_id` del conductor queda en `null` y la tarjeta desaparece.
- [ ] Con un viaje `aceptada` o `en_curso`, la salida se rechaza con "Terminá tu viaje en curso antes de salir de la remisería." y el conductor sigue vinculado.
- [ ] `salir_de_empresa()` rechaza a quien no es conductor y a un conductor independiente.
- [ ] Un `update` directo de `empresa_id` desde la API (rol `authenticated`) falla, tanto para ponerlo en `null` como para cambiarlo de remisería.
- [ ] `aceptar_invitacion` y `quitar_conductor` siguen funcionando.
- [ ] Editar perfil, alias/CVU y el switch "En línea" siguen funcionando.
- [ ] Tras salir, la remisería ve al conductor como ex conductor con los viajes que hizo para ella.
- [ ] La migración 0030 corre dos veces seguidas sin error.
- [ ] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** bloquear la salida con un viaje `aceptada` o `en_curso`. **No:** permitirla siempre. Decisión del usuario: el destinatario del pago se resuelve al finalizar (`registrar_pago`, Spec 10) y `datos_cobro` (Spec 15) lee la remisería actual, así que salir en el medio le sacaría ese cobro a la remisería.
- **Sí:** confirmación en línea en la misma tarjeta. **No:** un solo toque ni `window.confirm`. Decisión del usuario: es una acción que no se deshace sola (volver requiere una invitación nueva), y los diálogos del navegador no siguen el estilo de la app.
- **Sí:** cerrar en este spec la escritura directa de `empresa_id`. **No:** dejarlo para otro spec. Decisión del usuario: sin esto, el bloqueo por viaje activo se esquiva con un `update` por la API, y además cualquier conductor puede entrar a una remisería sin invitación.
- **Sí:** trigger que mira `current_user`. **No:** reemplazar la policy de update por permisos por columna (`grant update (nombre, …)`). El trigger toca una sola columna y no obliga a listar (y mantener) todas las demás que el usuario sí puede editar.
- **Sí:** la salida no cambia `invitaciones`. **No:** marcar la invitación aceptada como "salida". La tabla es el flujo de consentimiento, no un historial; la remisería puede volver a invitar al conductor como a cualquiera.
- **Sí:** las ofertas abiertas (`ofrecida`) no bloquean la salida. **No:** bloquear también por oferta. Si el conductor acepta una oferta después de salir, el viaje es de él como independiente, igual que con cualquier viaje que toma después.
- **Sí:** la UI vive en `invitaciones-conductor.tsx`, donde ya está "Tu remisería". **No:** una ruta nueva `/perfil/remiseria`. Es un solo botón.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Carrera: el conductor acepta un viaje en el mismo instante en que sale, y el chequeo de `salir_de_empresa` no lo ve. | Muy poco probable (es la misma persona haciendo dos cosas a la vez). Si pasa, ese viaje lo cobra como independiente, que es lo mismo que pasaría con `quitar_conductor` hoy. |
| Una RPC futura que cambie `empresa_id` sin ser `security definer` falla por el trigger. | Comentado en la migración; todas las RPC de remiserías son `security definer`. |
| Cambios hechos desde el SQL Editor (rol `postgres`) no pasan por el trigger. | Es lo esperado: el dashboard es administración. |
| La remisería no se entera de que el conductor se fue hasta que abre `/empresa`. | Aceptado: no hay notificaciones en el MVP. Lo ve como ex conductor. |
| `quitar_conductor` (lado remisería) sigue sin bloquear con viaje activo. | Fuera de alcance; mismo comportamiento que hoy. |

## Lo que **no** entra en este spec

- Notificar a la remisería.
- Fecha de salida o historial de pertenencia.
- Bloqueo por viaje activo en `quitar_conductor`.
- Preaviso o aprobación de la salida.
- Proteger otras columnas de `profiles` (por ejemplo `role`).

Cada uno de esos, si aterriza, va en su propio spec.
