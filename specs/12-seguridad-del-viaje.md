# SPEC 12 — Contactos de confianza y alerta de emergencia

> **Estado:** implementado
> **Depende de:** SPEC 01, SPEC 04
> **Fecha:** 2026-09-29
> **Objetivo:** Cubrir CUP-08 / US-08 / US-09 (pantallas P07 y P10) dándole al pasajero una capa mínima de seguridad durante el viaje: puede guardar **contactos de confianza** (nombre + teléfono) desde `/perfil/contactos`, y desde el viaje en curso (P07) el botón **"Emergencia"** registra una alerta con su ubicación y además llama al 911, mientras que **"Compartir viaje"** le sugiere mandar el resumen del viaje directamente a uno de esos contactos.

Hoy `/perfil` (Spec 02/09/11) ya tiene una entrada "Contactos de confianza" marcada **"Próximamente"**, y P07 (`app/viajar/viaje-pendiente.tsx`, Spec 04/06) ya tiene un botón "Emergencia · llamar al 911" que sólo abre el marcador (`tel:911`) y un botón "Compartir viaje" que dispara la hoja de compartir genérica del sistema. Este spec cierra esas dos puntas: agrega el CRUD de contactos que faltaba y hace que ambos botones de P07 usen esos contactos —sin tocar el despacho, la tarifa ni los pagos.

## Alcance

**Incluye:**

- Migración SQL `supabase/migrations/0014_seguridad.sql` (idempotente):
  - Tabla nueva `public.contactos_confianza` (`usuario_id`, `nombre`, `telefono`, `created_at`), con RLS: cada usuario **lee, agrega y borra sólo los suyos** (`auth.uid() = usuario_id`); sin `update` (el flujo es agregar/quitar, no editar).
  - Tabla nueva `public.alertas_emergencia` (`trip_id`, `usuario_id`, `ubic_lat`, `ubic_lng`, `created_at`), registro **de sólo inserción** (sin update/delete): cada usuario lee sus propias alertas; inserta sólo si el `trip_id` es un viaje **propio** (`trips.pasajero_id = auth.uid()`). `ubic_lat`/`ubic_lng` son **nullables**: si el navegador no puede dar un fix (permiso denegado, timeout), la alerta se registra igual, sin coordenadas.
- **Tipos TypeScript** (`lib/supabase/types.ts`, extendido): `ContactoConfianza`, `AlertaEmergencia`.
- **Server Actions** (`app/actions/seguridad.ts`, nuevo): `getContactos()`, `agregarContacto(prevState, formData)` (valida nombre + teléfono, mismo patrón que `guardarPerfil`), `quitarContacto(id)`, y `registrarAlerta(tripId, ubicacion | null)`.
- **Pantalla `/perfil/contactos`** (`app/perfil/contactos/page.tsx` + `contactos-form.tsx`, nuevos): lista los contactos guardados con botón **"Quitar"** por fila, y un formulario **"Agregar contacto"** (nombre + teléfono). En `app/perfil/page.tsx`, la entrada **"Contactos de confianza"** deja de decir "Próximamente" y pasa a linkear ahí.
- **P07 en `app/viajar/viaje-pendiente.tsx`** (sólo la parte del viaje en curso — búsqueda de conductor y el recibo/calificación **no** cambian):
  - **"Emergencia"** sigue siendo un enlace `tel:911` (para que el 911 se marque igual aunque JS falle), pero ahora además dispara —sin bloquear ni demorar la llamada— `registrarAlerta` con la posición GPS que el navegador pueda dar en ese instante (o `null` si no hay fix).
  - **"Compartir viaje"**: si el pasajero tiene contactos guardados, el botón abre una lista corta con esos contactos (cargados sólo al tocar el botón, no antes) — tocar uno abre un SMS prellenado (`sms:`) con el resumen del viaje a ese número; hay además una opción **"Otra opción…"** que cae al comportamiento actual (hoja de compartir nativa / copiar al portapapeles). Si no tiene contactos guardados, el botón se comporta exactamente igual que hoy.

**Fuera de alcance (para specs futuros):**

- Notificar al contacto en tiempo real / push (el "compartir" sigue siendo un SMS o share que el pasajero dispara a mano, no un aviso automático).
- Ver o gestionar las `alertas_emergencia` desde ninguna pantalla (ni el pasajero ni la remisería): la tabla es sólo un registro de auditoría para este spec; un panel de alertas es un spec aparte.
- Botón de emergencia para el **conductor** (`app/conducir`): el checklist de este spec sólo toca `viaje-pendiente.tsx` (pasajero); el conductor no tiene P07.
- Editar un contacto existente (sólo agregar / quitar).
- Límite de cantidad de contactos, favoritos u orden manual.
- Cualquier integración real con el 911 más allá de abrir el marcador telefónico del sistema operativo (`tel:911`).

## Modelo de datos

Migración `supabase/migrations/0014_seguridad.sql`. Idempotente, se aplica a mano desde el SQL Editor del dashboard, como las anteriores.

### Tabla nueva `contactos_confianza`

```sql
create table if not exists public.contactos_confianza (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  nombre     text not null,
  telefono   text not null,
  created_at timestamptz not null default now()
);

create index if not exists contactos_confianza_usuario_idx
  on public.contactos_confianza (usuario_id);

alter table public.contactos_confianza enable row level security;

drop policy if exists "El usuario ve sus contactos" on public.contactos_confianza;
create policy "El usuario ve sus contactos"
  on public.contactos_confianza for select
  using (auth.uid() = usuario_id);

drop policy if exists "El usuario agrega sus contactos" on public.contactos_confianza;
create policy "El usuario agrega sus contactos"
  on public.contactos_confianza for insert
  with check (auth.uid() = usuario_id);

drop policy if exists "El usuario borra sus contactos" on public.contactos_confianza;
create policy "El usuario borra sus contactos"
  on public.contactos_confianza for delete
  using (auth.uid() = usuario_id);
```

### Tabla nueva `alertas_emergencia`

Registro de sólo-inserción (sin `update`/`delete`): una alerta, una vez disparada, no se edita ni se borra.

```sql
create table if not exists public.alertas_emergencia (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips(id) on delete cascade,
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  ubic_lat   double precision,
  ubic_lng   double precision,
  created_at timestamptz not null default now()
);

create index if not exists alertas_emergencia_usuario_idx on public.alertas_emergencia (usuario_id);
create index if not exists alertas_emergencia_trip_idx    on public.alertas_emergencia (trip_id);

alter table public.alertas_emergencia enable row level security;

drop policy if exists "El usuario ve sus alertas" on public.alertas_emergencia;
create policy "El usuario ve sus alertas"
  on public.alertas_emergencia for select
  using (auth.uid() = usuario_id);

-- Sólo se puede registrar una alerta sobre un viaje propio (el trip_id tiene
-- que ser un viaje donde el que llama es el pasajero).
drop policy if exists "El pasajero registra su alerta" on public.alertas_emergencia;
create policy "El pasajero registra su alerta"
  on public.alertas_emergencia for insert
  with check (
    auth.uid() = usuario_id
    and exists (
      select 1 from public.trips t
       where t.id = trip_id and t.pasajero_id = auth.uid()
    )
  );
```

### Tipos TypeScript (`lib/supabase/types.ts`, extendido)

```ts
export type ContactoConfianza = {
  id: string;
  usuario_id: string;
  nombre: string;
  telefono: string;
  created_at: string;
};

export type AlertaEmergencia = {
  id: string;
  trip_id: string;
  usuario_id: string;
  ubic_lat: number | null;
  ubic_lng: number | null;
  created_at: string;
};
```

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Spec.** Este documento (`specs/12-seguridad-del-viaje.md`). *Verificación:* revisión del alcance.
2. **Migración.** Escribir y ejecutar `supabase/migrations/0014_seguridad.sql`: tablas `contactos_confianza` y `alertas_emergencia` con sus índices y RLS. *Verificación (SQL Editor):* un usuario inserta/lee/borra sólo sus propios contactos; insertar un contacto de otro `usuario_id` falla por RLS; insertar una alerta sobre un `trip_id` ajeno falla por RLS; insertar una alerta con `ubic_lat`/`ubic_lng` en `null` funciona.
3. **Tipos + Server Actions + pantalla `/perfil/contactos`.** `lib/supabase/types.ts` (+`ContactoConfianza`, `AlertaEmergencia`); `app/actions/seguridad.ts` (nuevo: `getContactos`, `agregarContacto`, `quitarContacto`, `registrarAlerta`); `app/perfil/contactos/page.tsx` + `contactos-form.tsx` (nuevos); `app/perfil/page.tsx` (la entrada "Contactos de confianza" pasa de "Próximamente" a `href="/perfil/contactos"`). *Verificación:* `npm run lint` pasa; desde `/perfil` se entra a `/perfil/contactos`, se agrega un contacto (aparece en la lista) y se lo quita (desaparece); un teléfono inválido muestra error sin guardar.
4. **P07 en `viaje-pendiente.tsx`.** El enlace "Emergencia" dispara `registrarAlerta` (con geolocalización best-effort) sin bloquear la navegación a `tel:911`; `BotonCompartir` carga los contactos al primer toque y, si hay alguno, muestra la lista con enlaces `sms:` antes de caer al compartir nativo. *Verificación:* con contactos guardados, "Compartir viaje" primero muestra la lista; sin contactos, se comporta igual que antes; tocar "Emergencia" sigue abriendo el marcador con 911.
5. **Prueba end-to-end.** Como pasajero: guardar dos contactos en `/perfil/contactos`. Solicitar un viaje y llegar a P07 (aceptado/en curso). Tocar "Compartir viaje": aparece la lista de los dos contactos + "Otra opción…"; tocar uno abre el compositor de SMS con el resumen del viaje prellenado. Tocar "Emergencia": el marcador se abre con 911 y, en paralelo, queda una fila nueva en `alertas_emergencia` con la ubicación (o `null` si se negó el permiso de geolocalización). Quitar los contactos y repetir "Compartir viaje": vuelve al comportamiento anterior (hoja nativa / portapapeles). *Verificación:* todos los criterios de aceptación.

## Criterios de aceptación

- [ ] Existen las tablas `public.contactos_confianza` y `public.alertas_emergencia`, ambas con RLS activa.
- [ ] Un usuario sólo puede leer/agregar/borrar sus propios `contactos_confianza` (RLS por `usuario_id = auth.uid()`); no hay policy de `update`.
- [ ] Un usuario sólo puede leer sus propias `alertas_emergencia`, y sólo puede insertar una alerta sobre un `trip_id` donde es el `pasajero_id`; no hay `update`/`delete`.
- [ ] `alertas_emergencia.ubic_lat`/`ubic_lng` aceptan `null` (una alerta sin ubicación se registra igual).
- [ ] En `/perfil`, la entrada "Contactos de confianza" ya no dice "Próximamente" y lleva a `/perfil/contactos`.
- [ ] `/perfil/contactos` lista los contactos del usuario logueado; "Agregar contacto" valida nombre no vacío y teléfono de al menos 8 dígitos, y agrega el contacto sin recargar la página completa; "Quitar" lo elimina de la lista.
- [ ] Un usuario no ve ni puede tocar los contactos de otro usuario.
- [ ] En P07, tocar "Emergencia" abre `tel:911` **y** además registra una fila en `alertas_emergencia` para ese viaje y ese usuario (con ubicación si el navegador la dio, `null` si no).
- [ ] En P07, tocar "Compartir viaje" con contactos guardados muestra primero la lista de contactos (con opción "Otra opción…" para el comportamiento anterior); sin contactos guardados, se comporta exactamente igual que antes del spec.
- [ ] Elegir un contacto de la lista abre un enlace `sms:` con el número del contacto y el resumen del viaje prellenado.
- [ ] La búsqueda de conductor (P06), el recibo y la calificación (P08/P09) no cambian.
- [ ] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** una tabla `contactos_confianza` con RLS directa (`auth.uid() = usuario_id`), **sin** RPC `security definer`. **No:** el patrón de RPC que usan Spec 08/09/11. Acá no hay ningún cruce entre usuarios (cada uno gestiona sólo su propia fila, como `vehicles` del Spec 02): RLS directa alcanza y es más simple.
- **Sí:** `alertas_emergencia` es **de sólo inserción** (sin `update`/`delete`, sin pantalla para verla). **No:** un panel de alertas para la remisería o el pasajero. El spec pide "registra la alerta"; qué se hace con ese registro (notificar, escalar, mostrar a alguien) es una capa de gestión que no está definida todavía y merece su propio spec.
- **Sí:** `ubic_lat`/`ubic_lng` **nullable**, la alerta se registra igual sin fix de GPS. **No:** exigir ubicación para poder registrar la alerta. En una emergencia real, un usuario sin señal GPS (o que rechazó el permiso) no puede quedar sin registro; una alerta sin coordenadas sigue siendo mejor que ninguna.
- **Sí:** "Emergencia" sigue siendo un `<a href="tel:911">` normal (con `onClick` que dispara el registro en paralelo, sin `preventDefault`). **No:** convertirlo en un botón que primero espera la respuesta del servidor y recién después llama. Igual que hoy, el 911 tiene que marcarse aunque el fetch falle, esté lento, o el usuario no tenga conexión de datos en ese instante.
- **Sí:** "Compartir viaje" carga los contactos **recién al tocar el botón** (lazy), no al entrar a P07. **No:** precargarlos apenas se abre la pantalla. Es un dato que se usa sólo si el pasajero decide compartir; traerlo antes es un round-trip innecesario en una pantalla que ya hace polling (Spec 06).
- **Sí:** compartir con un contacto abre un `sms:` con el texto prellenado (el pasajero manda el mensaje él mismo). **No:** un envío automático de SMS/WhatsApp/push desde el servidor. Mandar mensajes a terceros por cuenta del usuario es una integración con proveedor de SMS (costo, opt-in, spam) fuera del alcance de este spec; con `sms:` el propio dispositivo del pasajero hace el envío, como ya hacía `navigator.share`.
- **Sí:** sin límite de contactos ni edición, sólo agregar/quitar. **No:** un CRUD completo con edición inline. El checklist pide "agregar y quitar"; edición es agregar de nuevo + quitar el viejo, y no vale la ceremonia extra para esta capa.
- **Sí:** el botón de emergencia queda **sólo** en `viaje-pendiente.tsx` (pasajero). **No:** agregarlo también al lado del conductor (`app/conducir`). Fuera del alcance pedido; el conductor no tiene una pantalla P07 equivalente hoy.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| **Alerta fantasma:** si `registrarAlerta` falla silenciosamente (red caída, RLS mal configurada), el pasajero cree que quedó un registro y no lo hay. | El 911 se llama igual (no depende del registro); el registro es una capa de auditoría adicional, no la única vía de ayuda. Es un riesgo aceptado explícitamente (ver Decisiones): en un evento real, la llamada telefónica es la mitigación primaria. |
| **`sms:` no soportado o mal formado en algunos navegadores/SO.** | Es un enlace estándar (`sms:<número>?body=<texto>`) con degradación aceptable: si el dispositivo no puede abrirlo, no pasa nada (no rompe la pantalla); "Otra opción…" siempre está disponible como alternativa. |
| **RLS de `alertas_emergencia` demasiado laxa/estricta:** un bug en el `exists (...)` podría dejar registrar alertas sobre viajes ajenos, o bloquear alertas legítimas. | El `with check` valida `trips.pasajero_id = auth.uid()` sobre el mismo `trip_id` insertado; se verifica en el paso 2 (SQL Editor) que un `trip_id` ajeno falla antes de tocar el front. |
| **Contactos vacíos rompiendo "Compartir viaje".** | Si `getContactos()` devuelve `[]`, el botón cae directo al flujo actual (nativo/portapapeles); no hay estado intermedio roto. |

## Lo que **no** entra en este spec

- Notificación automática / push a los contactos.
- Panel de alertas de emergencia (para el pasajero, el conductor o la remisería).
- Botón de emergencia del lado del conductor.
- Edición de un contacto existente.
- Límite, orden o favoritos de contactos.
- Integración real con servicios de emergencia más allá de `tel:911`.
