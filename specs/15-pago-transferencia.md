# SPEC 15 — Pago por transferencia

> **Estado:** Propuesto
> **Depende de:** SPEC 01, SPEC 09, SPEC 10
> **Fecha:** 2026-09-30
> **Objetivo:** Que el pasajero pueda pagar el viaje por transferencia: el conductor (o, si pertenece a una, su remisería) carga su alias/CVU en su perfil, y el pasajero lo ve en el recibo del viaje al finalizar (P08). Cubre US-07.

El Spec 10 ya modela el método "digital" como un pago simulado: se liquida solo al finalizar, sin pasarela real ni movimiento de dinero. Este spec no cambia ese modelo — sigue siendo simulado, nadie verifica que la transferencia haya ocurrido de verdad —, sólo le da contenido real a esa etiqueta: hoy el pasajero elige "Digital" sin saber a dónde transferir. A partir de acá, "Digital" pasa a llamarse **"Transferencia"** en toda la interfaz, el conductor y la remisería cargan su alias/CVU en `/perfil/pagos` (el ítem "Métodos de pago" del menú, hoy deshabilitado), y una RPC nueva le resuelve al pasajero el alias correcto —el del conductor si es independiente, el de su remisería si pertenece a una— para mostrarlo en el recibo (`Recibo`, P08, en `app/viajar/viaje-pendiente.tsx`).

## Alcance

**Incluye:**

- Migración `supabase/migrations/0016_cobro.sql` (idempotente):
  - Columna `alias_cvu text` en `profiles` (nullable; sólo la cargan conductor y empresa).
  - RPC `datos_cobro(p_trip_id uuid)` (`security definer`): valida que quien llama sea el pasajero del viaje, resuelve el destinatario igual que `registrar_pago` del Spec 10 (la empresa del conductor si tiene `empresa_id`, si no el propio conductor), y devuelve su `alias_cvu` y `nombre` (para mostrar "Transferí a \<nombre\>").
- **Server Actions** (`app/actions/pagos-transferencia.ts`, nuevo):
  - `getAliasCvu()`: lee el `alias_cvu` propio (para precargar el form de `/perfil/pagos`).
  - `guardarAliasCvu(prevState, formData)`: valida rol (conductor o empresa) y que el alias no esté vacío, y actualiza `profiles.alias_cvu` del usuario logueado (RLS existente de "editar mi perfil" ya lo permite; no hace falta una policy nueva).
  - `datosCobro(tripId)`: llama a la RPC `datos_cobro` y devuelve `{ aliasCvu, nombreTitular } | null`, para que el recibo lo consuma del lado del cliente.
- **Pantalla `/perfil/pagos`** (`app/perfil/page.tsx`, editado + `app/perfil/pagos/page.tsx` y `app/perfil/pagos/pagos-form.tsx`, nuevos): conductor y empresa cargan/editan su alias o CVU. Sigue el mismo patrón que `/perfil/contactos` (Spec 12): página server que redirige si el rol no corresponde, form cliente con `useActionState`.
- **Menú de perfil** (`app/perfil/page.tsx`): el ítem "Métodos de pago" (hoy sin `href`, con badge "Próximamente") pasa a linkear a `/perfil/pagos` para conductor y empresa; el pasajero lo sigue viendo deshabilitado (no tiene nada que cobrar).
- **Componente nuevo `app/viajar/datos-transferencia.tsx`**: pide `datosCobro(tripId)` al montarse y muestra el alias/CVU (con un botón "Copiar", igual que el patrón ya usado en `BotonCompartir`) o, si el destinatario no cargó ninguno, un aviso de que hay que coordinarlo directo. Se agrega al `Recibo` de `app/viajar/viaje-pendiente.tsx` con **una sola línea** (`{digital && <DatosTransferencia tripId={trip.id} />}`), para no tocar nada de lo que el Spec 12 agregó en esa misma pantalla (que vive en el bloque P07, no en `Recibo`/P08).
- **Renombrar "Digital" → "Transferencia" en toda la interfaz**, sin tocar el modelo de datos: el enum `metodo_pago` y la columna `trips.metodo_pago` siguen guardando `'digital'`. Dos puntos de cambio:
  - `lib/formato.ts` → `metodoPago()`: de ahí sale el label en el recibo, el panel del conductor, el historial y la búsqueda de conductor.
  - `app/viajar/selector-viaje.tsx` (línea ~184): el `texto: "Digital"` del `Segmentado` al solicitar viaje, que no pasa por `metodoPago()`.

**Fuera de alcance (para specs futuros):**

- Pasarela de transferencia real o verificación bancaria de que el dinero efectivamente llegó: sigue siendo simulado, igual que todo pago "digital" desde el Spec 10.
- Validación de formato real de alias (contra el padrón bancario) o de CVU (22 dígitos): sólo se valida que no esté vacío.
- Mostrar los datos de transferencia durante el viaje en curso (P07): sólo en el recibo al finalizar (P08), como pide el spec.
- Que el pasajero cargue su propio alias: no cobra, no le hace falta.
- QR para transferir, notificaciones push, o aviso al conductor de que el pasajero vio sus datos.
- Reparto interno empresa↔conductor de quién recibe la transferencia primero (sigue fuera de alcance desde el Spec 10).
- Renombrar el valor del enum `metodo_pago` (`'digital'` → algo como `'transferencia'`): cambiaría una migración ya aplicada; sólo cambia la etiqueta que ve el usuario.

## Modelo de datos

Migración `supabase/migrations/0016_cobro.sql`. Idempotente.

```sql
-- SPEC 15 — Pago por transferencia
-- Idempotente: seguro de re-ejecutar.

-- Alias o CVU para recibir transferencias. Sólo lo cargan conductor y empresa
-- (el pasajero no cobra); nullable porque no es obligatorio al registrarse.
alter table public.profiles
  add column if not exists alias_cvu text;

-- Le resuelve al pasajero a quién transferirle: la empresa del conductor si
-- pertenece a una, si no el propio conductor (mismo criterio que
-- registrar_pago en el Spec 10). Sólo el pasajero del viaje puede consultarlo.
create or replace function public.datos_cobro(p_trip_id uuid)
returns table (alias_cvu text, nombre_titular text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_trip      public.trips;
  v_emp       uuid;
  v_dest      uuid;
begin
  select * into v_trip from public.trips where id = p_trip_id;
  if v_trip.id is null or v_trip.pasajero_id <> auth.uid() then
    raise exception 'viaje inexistente o no sos el pasajero';
  end if;

  select empresa_id into v_emp from public.profiles where id = v_trip.conductor_id;
  v_dest := coalesce(v_emp, v_trip.conductor_id);

  return query
    select p.alias_cvu, p.nombre from public.profiles p where p.id = v_dest;
end;
$$;
```

Convención: no hace falta una policy de RLS nueva para escribir `alias_cvu` — la policy "Los usuarios editan su propio perfil" del Spec 01 (`for update using (auth.uid() = id)`, sin `with check` propio) ya cubre cualquier columna del propio perfil. Tampoco hace falta abrir el `select` de `profiles` entre usuarios: la lectura cruzada (pasajero → conductor/empresa) pasa entera por la RPC `security definer`, igual que `registrar_pago` en el Spec 10.

**Tipos TypeScript** (`lib/supabase/types.ts`, extendido):

```ts
// Profile gana el alias/CVU para cobrar (sólo lo usan conductor y empresa).
export type Profile = {
  // …campos previos…
  alias_cvu: string | null;
};

// Lo que devuelve la RPC datos_cobro(trip_id) al pasajero.
export type DatosCobro = {
  alias_cvu: string | null;
  nombre_titular: string | null;
};
```

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Commit 1 — este spec.** `specs/15-pago-transferencia.md`.

2. **Migración.** Ejecutar `supabase/migrations/0016_cobro.sql` en el SQL Editor: columna `profiles.alias_cvu` y RPC `datos_cobro`. *Verificación (SQL Editor):* sobre un viaje propio como pasajero, `select * from datos_cobro('<trip_id>')` devuelve la fila del conductor (o de su empresa, si pertenece a una); llamarla como otro usuario ajeno al viaje lanza la excepción.

3. **Tipos.** En `lib/supabase/types.ts`: `Profile` gana `alias_cvu`; tipo nuevo `DatosCobro`. *Verificación:* `npm run lint` pasa (obliga a ajustar donde se arma `Profile` a mano, si aplica).

4. **Server Actions.** `app/actions/pagos-transferencia.ts`: `getAliasCvu()`, `guardarAliasCvu(prevState, formData)` (valida rol conductor/empresa y alias no vacío) y `datosCobro(tripId)`. *Verificación:* se pueden importar sin errores de tipo (`npm run build`).

5. **Pantalla `/perfil/pagos`.** `app/perfil/pagos/page.tsx` (server: redirige a `/perfil` si el rol no es conductor ni empresa) + `app/perfil/pagos/pagos-form.tsx` (client, mismo patrón que `contactos-form.tsx`: un input "Alias o CVU" con `inputCls`/`etiquetaCls`, botón `btnPrimario`, `MensajeError`). *Verificación:* como conductor, cargar un alias y volver a entrar lo muestra precargado.

6. **Menú de perfil.** En `app/perfil/page.tsx`: `<Opcion href={esConductor || esEmpresa ? "/perfil/pagos" : undefined} ...>Métodos de pago</Opcion>`. *Verificación:* conductor y empresa ven la flecha y entran a `/perfil/pagos`; el pasajero sigue viendo "Próximamente".

7. **Renombrar la etiqueta.** `lib/formato.ts` → `metodoPago()` devuelve `"Transferencia"` para `'digital'`. `app/viajar/selector-viaje.tsx` línea ~184 → `texto: "Transferencia"`. *Verificación:* ningún texto "Digital" queda visible en el selector al solicitar, el recibo, el panel del conductor ni el historial (`grep -rn "Digital" app/` no debería dar resultados de UI, sólo comentarios internos si quedan).

8. **Componente del recibo.** `app/viajar/datos-transferencia.tsx`: al montarse pide `datosCobro(trip.id)`; si hay `alias_cvu`, lo muestra junto al `nombre_titular` con un botón "Copiar" (mismo patrón `copiado`/`setTimeout` que `BotonCompartir`); si no, un aviso corto ("Todavía no cargó su alias/CVU. Coordinalo directo."). En `viaje-pendiente.tsx`, dentro de `Recibo`, agregar `{digital && <DatosTransferencia tripId={trip.id} />}` justo debajo del bloque "Medio de pago". *Verificación:* un viaje por transferencia muestra el alias al finalizar; uno en efectivo no muestra nada de esto.

9. **Prueba end-to-end.** Un conductor independiente carga su alias en `/perfil/pagos`; un pasajero solicita un viaje eligiendo transferencia, lo completa, y en el recibo ve el alias del conductor. Repetir con un conductor de una remisería que cargó su propio alias pero **no** el de la empresa: el recibo debe mostrar el alias de la **empresa** (o el aviso, si la empresa tampoco cargó ninguno) — nunca el del conductor. Un viaje en efectivo no debe mostrar el bloque. *Verificación:* todos los criterios de aceptación.

## Criterios de aceptación

- [ ] Existe la columna `profiles.alias_cvu` (nullable) y la RPC `datos_cobro(p_trip_id)`, ambas aplicadas por una migración idempotente.
- [ ] Un conductor puede cargar y editar su alias/CVU en `/perfil/pagos`, y queda guardado en `profiles.alias_cvu`.
- [ ] Una empresa (remisería) puede cargar y editar su alias/CVU en `/perfil/pagos`.
- [ ] Un pasajero que intenta entrar a `/perfil/pagos` es redirigido a `/perfil`.
- [ ] En el menú de `/perfil`, "Métodos de pago" lleva a `/perfil/pagos` para conductor y empresa, y sigue mostrando "Próximamente" (deshabilitado) para el pasajero.
- [ ] Al finalizar un viaje pagado por transferencia, el recibo muestra el alias/CVU del **conductor** si es independiente.
- [ ] Al finalizar un viaje de un conductor que pertenece a una **remisería**, el recibo muestra el alias/CVU de la **empresa**, no el del conductor (aunque el conductor también tenga uno cargado).
- [ ] Si el destinatario (conductor o empresa) no cargó ningún alias/CVU, el recibo muestra un aviso en vez de un dato vacío o roto.
- [ ] Un viaje pagado en efectivo no muestra el bloque de datos de transferencia en el recibo.
- [ ] `datos_cobro` rechaza (excepción) si quien llama no es el pasajero del viaje consultado.
- [ ] La palabra "Digital" no aparece en ninguna pantalla (selector al solicitar, recibo, panel del conductor, historial): en todas dice "Transferencia".
- [ ] El enum `metodo_pago` y la columna `trips.metodo_pago` siguen usando el valor `'digital'` sin cambios; el renombre es sólo de etiqueta.
- [ ] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** renombrar sólo la **etiqueta** ("Digital" → "Transferencia"). **No:** tocar el enum `metodo_pago` ni la columna `trips.metodo_pago`. Evita una migración de datos sobre una columna ya en uso desde el Spec 10; el valor interno (`'digital'`) es un detalle de implementación que no ve nadie.
- **Sí:** una RPC `security definer` (`datos_cobro`) para que el pasajero lea el alias del conductor/empresa. **No:** abrir una policy de `select` en `profiles` entre usuarios sin relación. Mantiene el mismo patrón del Spec 10 (`registrar_pago`): el cruce entre partes de un viaje pasa por una función que valida el vínculo, no por RLS abierta.
- **Sí:** la RPC devuelve también `nombre_titular` (reutilizando `profiles.nombre`, sin columna nueva). **No:** un campo de "nombre para transferencias" separado. El recibo queda más claro ("Transferí a María, alias mariar.mp") sin agregar estado nuevo.
- **Sí:** escribir `alias_cvu` con un `update` directo a `profiles` desde la Server Action, apoyado en la policy de edición del propio perfil que ya existe. **No:** una RPC nueva para guardar. No hay nada que validar del lado del servidor más allá de "no vacío" y el rol, así que una policy existente alcanza.
- **Sí:** el destinatario del alias es el mismo que el destinatario del pago (`registrar_pago` del Spec 10): la empresa si el conductor pertenece a una, si no el conductor. **No:** mostrar el alias del conductor aunque pertenezca a una empresa. Sería inconsistente con a quién realmente le llega el neto del pago.
- **Sí:** si no hay alias cargado, mostrar un aviso en vez de ocultar el bloque entero. **No:** dejar el recibo sin ninguna mención a cómo pagar. El pasajero necesita saber que tiene que coordinar el pago de otra forma, no asumir que ya está resuelto.
- **No:** validar el formato del alias/CVU contra un padrón real. Todo el pago sigue siendo simulado (decisión ya tomada en el Spec 10); pedir un formato estricto sería una falsa sensación de validación real.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El alias es texto libre sin validar: un conductor puede cargar cualquier cosa (o un alias ajeno) y el pasajero le transferiría mal. | Aceptable en el MVP: el sistema es simulado y no mueve plata real; queda documentado como decisión. Una pasarela real (fuera de alcance) resolvería esto de raíz. |
| `datos_cobro` se llama desde el cliente cada vez que se ve el recibo: alguien podría intentar llamarla con un `trip_id` ajeno. | La función valida `pasajero_id = auth.uid()` antes de devolver nada; se verifica explícitamente en el paso de migración y en el end-to-end. |
| Un conductor de una remisería puede no saber que el pasajero ve el alias de la **empresa**, no el suyo, y cargar el propio pensando que se usa. | Es el comportamiento correcto (coherente con quién recibe el neto); si genera confusión de producto, un mensaje aclaratorio en `/perfil/pagos` para conductores de una remisería es un ajuste de UI menor, no de este spec. |
| Cambiar el label a "Transferencia" en `lib/formato.ts` es un solo punto, pero `selector-viaje.tsx` lo hardcodea aparte (no pasa por `metodoPago()`) — fácil de olvidar. | El plan de implementación lo marca como paso explícito (paso 7) con un `grep` de verificación por "Digital" en `app/`. |

## Lo que **no** entra en este spec

- Pasarela de transferencia real o conciliación bancaria (sigue simulado, como todo pago digital desde el Spec 10).
- Validación de formato de alias/CVU contra un padrón real.
- Datos de transferencia visibles durante el viaje en curso (P07); sólo en el recibo (P08).
- Que el pasajero cargue datos de cobro propios.
- QR, notificaciones o confirmaciones de que el pasajero efectivamente transfirió.
- Reparto interno empresa↔conductor de la transferencia recibida.
- Renombrar el valor del enum `metodo_pago` en la base de datos.

Cada uno de esos, si aterriza, va en su propio spec (la pasarela real es el candidato natural, ya señalado como pendiente desde el Spec 10).
