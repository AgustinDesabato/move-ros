# SPEC 26 — Lugares favoritos

> **Estado:** implementado
> **Depende de:** SPEC 03, SPEC 04, SPEC 16, SPEC 19
> **Fecha:** 2026-10-07
> **Objetivo:** Que el pasajero guarde hasta 5 lugares con nombre ("Casa", "Trabajo") desde su perfil y los elija como destino con un toque en P04, arriba de los recientes.

El Spec 16 agregó la lista "Recientes" en P04 y dejó los favoritos explícitamente fuera de alcance, como "el candidato natural" para otro spec. Los recientes se derivan de `trips`: no tienen nombre, son sólo 3 y un lugar sale de la lista cuando lo desplazan destinos más nuevos. Un pasajero que va seguido a su casa o a su trabajo no tiene forma de fijarlos.

Este spec agrega una tabla propia de lugares con nombre, una pantalla en el perfil para cargarlos y borrarlos (mismo esquema que los contactos de confianza del Spec 12) y una sección "Favoritos" en P04 (`app/viajar/selector-viaje.tsx`) que funciona igual que "Recientes": tocar un favorito equivale a haber elegido esa dirección en el autocompletado.

## Alcance

**Incluye:**

- **Tabla `lugares_favoritos`** (migración `supabase/migrations/0027_lugares_favoritos.sql`, idempotente): nombre, dirección y coordenadas, con RLS para que cada usuario vea, agregue y borre sólo los suyos.
- **Tipo TypeScript** `LugarFavorito` en `lib/supabase/types.ts`.
- **Validador** `validarNombreLugar` en `lib/validacion.ts`: 2 a 30 caracteres tras `trim`, espacios internos repetidos colapsados a uno, sin restricción de caracteres.
- **Server Actions** en `app/actions/favoritos.ts` (nuevo): `getFavoritos()`, `agregarFavorito(prevState, formData)` y `quitarFavorito(id)`.
- **Pantalla `/perfil/favoritos`** (`app/perfil/favoritos/page.tsx` + `favoritos-form.tsx`, nuevos): lista de los lugares guardados, cada uno con su nombre, su dirección y un botón "Quitar". Debajo, el formulario de alta: campo "Nombre" y el buscador de direcciones que ya usa P04 (`app/viajar/buscador-direccion.tsx`, reutilizado sin moverlo). Sólo para el rol `pasajero`; cualquier otro rol que entre por la URL va a `/perfil`.
- **Tope de 5 lugares** por pasajero: con 5 guardados, el formulario de alta se reemplaza por el aviso "Podés guardar hasta 5 lugares. Quitá uno para agregar otro.", y `agregarFavorito` rechaza el sexto.
- **Nombre sin repetir** entre los lugares de un mismo pasajero, sin distinguir mayúsculas ("Casa" y "casa" son el mismo).
- **Errores por campo** con el patrón del Spec 19 (`ErrorCampo`, `useErroresCampo`, `valores` conservados): debajo de "Nombre" y debajo de la dirección.
- **Opción "Lugares favoritos"** en el menú de `/perfil` (`app/perfil/page.tsx`), visible sólo para el pasajero.
- **Sección "Favoritos" en P04** (`app/viajar/page.tsx` y `app/viajar/selector-viaje.tsx`): debajo del campo "Destino" y arriba de "Recientes". Cada fila muestra el nombre y, debajo, la dirección; al tocarla se elige como destino (`setDestino`). Se muestra sólo mientras no hay destino elegido y sólo si hay al menos un favorito.
- **Sin repetidos entre las dos listas:** un reciente cuya dirección coincide con la de un favorito no se muestra en "Recientes".
- **Encuadre del mapa:** el margen inferior que P04 le pasa al mapa crece también con la lista de favoritos.

**Fuera de alcance (para specs futuros):**

- Editar un favorito (nombre o dirección): se quita y se carga de nuevo.
- Guardar un favorito desde "Confirmar viaje" (P05) o desde un reciente.
- Usar un favorito como **origen**.
- Elegir el punto en el mapa en vez de buscar la dirección.
- Ícono propio por lugar (casa, maletín) o lugares fijos "Casa" y "Trabajo".
- Reordenar los favoritos a mano.
- Favoritos para el conductor, la remisería o soporte.
- Mostrar el nombre del favorito en el viaje (al conductor o en el historial): el viaje guarda la dirección, como siempre.
- Tope de 5 garantizado en la base (trigger o policy).

## Modelo de datos

### Migración `0027_lugares_favoritos.sql`

Idempotente, se aplica a mano desde el SQL Editor del dashboard y se puede pegar entera en una sola ejecución. Lleva el número 0027 y no 0026 porque `0026_resolver_reclamo_sin_sesion.sql` (corrección del Spec 22) ya ocupa ese número.

```sql
-- SPEC 26 — Lugares favoritos
-- Idempotente: segura de re-ejecutar (no duplica ni borra datos).

-- Lugares con nombre guardados por el pasajero ("Casa", "Trabajo"). Cada
-- usuario ve, agrega y borra sólo los suyos; no hay edición.
create table if not exists public.lugares_favoritos (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  nombre     text not null,
  direccion  text not null,
  lat        double precision not null,
  lng        double precision not null,
  created_at timestamptz not null default now(),
  constraint lugares_favoritos_nombre_formato
    check (nombre = btrim(nombre) and char_length(nombre) between 2 and 30),
  constraint lugares_favoritos_direccion_no_vacia
    check (btrim(direccion) <> '')
);

-- Un nombre por usuario, sin distinguir mayúsculas. Cubre también el filtro
-- por usuario_id.
create unique index if not exists lugares_favoritos_usuario_nombre_idx
  on public.lugares_favoritos (usuario_id, lower(nombre));

alter table public.lugares_favoritos enable row level security;

drop policy if exists "El usuario ve sus lugares" on public.lugares_favoritos;
create policy "El usuario ve sus lugares"
  on public.lugares_favoritos for select
  using (auth.uid() = usuario_id);

drop policy if exists "El usuario agrega sus lugares" on public.lugares_favoritos;
create policy "El usuario agrega sus lugares"
  on public.lugares_favoritos for insert
  with check (auth.uid() = usuario_id);

drop policy if exists "El usuario borra sus lugares" on public.lugares_favoritos;
create policy "El usuario borra sus lugares"
  on public.lugares_favoritos for delete
  using (auth.uid() = usuario_id);
```

No hay policy de `update`: un favorito no se edita. No hay RPC: no existe lectura cruzada entre usuarios.

`direccion` es la etiqueta que devolvió el geocoder (el `label` de `Place`), y `lat`/`lng` son las coordenadas de esa sugerencia. Es el mismo trío que `trips` guarda como `destino_label`, `destino_lat` y `destino_lng`.

### Tipo TypeScript (`lib/supabase/types.ts`, extendido)

```ts
// Un lugar con nombre guardado por el pasajero (Spec 26).
export type LugarFavorito = {
  id: string;
  usuario_id: string;
  nombre: string;
  direccion: string;
  lat: number;
  lng: number;
  created_at: string;
};
```

### Validador (`lib/validacion.ts`, extendido)

```ts
export const FAVORITOS_MAX = 5;

export function validarNombreLugar(crudo: string): Resultado;
```

`FAVORITOS_MAX` vive acá y no en `app/actions/favoritos.ts`: un archivo `"use server"` sólo puede exportar funciones async, y el formulario cliente también lo necesita.

| Caso | Mensaje |
| --- | --- |
| vacío | "Ingresá un nombre para el lugar." |
| largo fuera de 2–30 | "Tiene que tener entre 2 y 30 caracteres." |

### Server Actions (`app/actions/favoritos.ts`, nuevo)

```ts
export type CampoFavorito = "nombre" | "direccion";

export type FavoritoState =
  | {
      error?: string;
      errores?: ErroresCampo<CampoFavorito>;
      valores?: Record<string, string>;
    }
  | undefined;

export async function getFavoritos(): Promise<LugarFavorito[]>;
export async function agregarFavorito(
  prevState: FavoritoState,
  formData: FormData,
): Promise<FavoritoState>;
export async function quitarFavorito(id: string): Promise<void>;
```

- `getFavoritos()` lee los lugares del usuario logueado, `order created_at asc`, `limit FAVORITOS_MAX`. Sin sesión o si la consulta falla, devuelve `[]`.
- `agregarFavorito` recibe del formulario `nombre`, `direccion`, `lat` y `lng`. Los tres últimos van en `<input type="hidden">` que el formulario completa cuando el pasajero elige una sugerencia del buscador.
- Valida todos los campos antes de cortar y devuelve los errores juntos, como el resto de las acciones desde el Spec 19.

| Caso | Dónde aparece | Mensaje |
| --- | --- | --- |
| Nombre inválido | debajo de "Nombre" | el de `validarNombreLugar` |
| Sin dirección elegida, o `lat`/`lng` que no son números válidos | debajo de la dirección | "Elegí una dirección de la lista." |
| Nombre repetido (`23505` sobre `lugares_favoritos_usuario_nombre_idx`) | debajo de "Nombre" | "Ya tenés un lugar con ese nombre." |
| Ya hay 5 lugares | `MensajeError` general | "Podés guardar hasta 5 lugares. Quitá uno para agregar otro." |
| Falla al guardar | `MensajeError` general | "No se pudo guardar el lugar. Intentá de nuevo." |

`agregarFavorito` y `quitarFavorito` revalidan `/perfil/favoritos` y `/viajar`.

### P04

`app/viajar/page.tsx` pide `getFavoritos()` junto con `destinosRecientes()` (sólo sin viaje activo), saca de los recientes los que coinciden con un favorito y pasa las dos listas a `SelectorViaje`:

```ts
<SelectorViaje nombre={...} favoritos={favoritos} recientes={recientes} />
```

Un reciente coincide con un favorito cuando su `label` y la `direccion` del favorito son iguales sin distinguir mayúsculas ni espacios al borde. Es el mismo criterio con el que `destinosRecientes()` ya quita repetidos (Spec 16).

Al tocar un favorito, el destino queda como `{ lat, lng, label: direccion }`. El campo "Destino", "Confirmar viaje" y el viaje guardado muestran la dirección, no el nombre.

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Commit 1 — este spec.** `specs/26-lugares-favoritos.md`.

2. **Migración.** `supabase/migrations/0027_lugares_favoritos.sql` y aplicarla en Supabase. *Verificación (SQL Editor):* corre dos veces sin error; la tabla tiene RLS activado y las tres policies; un `insert` con `nombre = 'C'` falla por `lugares_favoritos_nombre_formato`.

3. **Tipo, validador y Server Actions.** `LugarFavorito` en `lib/supabase/types.ts`; `validarNombreLugar` en `lib/validacion.ts`; `app/actions/favoritos.ts` con `getFavoritos`, `agregarFavorito` y `quitarFavorito`. *Verificación:* `npm run lint` y `npm run build` pasan (todavía sin usar).

4. **Pantalla `/perfil/favoritos`.** `app/perfil/favoritos/page.tsx` (Server Component: sesión, guarda de rol, `getFavoritos()`) y `favoritos-form.tsx` (Client Component: lista con "Quitar" y formulario de alta con el buscador). Opción "Lugares favoritos" en `app/perfil/page.tsx` para el pasajero. *Verificación:* filas 1–8 del caso de prueba.

5. **Favoritos en P04.** `app/viajar/page.tsx` pide los favoritos, filtra los recientes repetidos y pasa `favoritos` a `SelectorViaje`. En `app/viajar/selector-viaje.tsx`: sección "Favoritos" arriba de "Recientes" y margen inferior del mapa que suma su alto. *Verificación:* filas 9–13 del caso de prueba.

6. **Prueba end-to-end.** Ver "Caso de prueba". *Verificación:* todos los criterios de aceptación, más `npm run build` y `npm run lint`.

## Caso de prueba

Precondición: `npm run dev` corriendo en `http://localhost:3000`, migración 0027 aplicada y un usuario **pasajero** (P) con el perfil completo y sin favoritos.

| # | Paso | Resultado esperado |
| --- | --- | --- |
| 1 | Como P, abrir `/perfil`. | Aparece la opción "Lugares favoritos". |
| 2 | Entrar a `/perfil/favoritos`. | Sin lista; se ve el formulario con "Nombre" y el buscador de dirección. |
| 3 | Enviar el formulario vacío. | Dos errores, uno debajo de "Nombre" y otro debajo de la dirección ("Elegí una dirección de la lista."). No se guarda nada. |
| 4 | Escribir `C` en "Nombre" y salir del campo. | Error "Tiene que tener entre 2 y 30 caracteres." debajo de "Nombre", sin enviar. |
| 5 | Escribir `Casa`, buscar una dirección A, elegir la sugerencia y guardar. | "Casa" aparece en la lista con la dirección A. El formulario queda vacío. |
| 6 | Intentar guardar otro lugar con nombre `casa`. | Error "Ya tenés un lugar con ese nombre." debajo de "Nombre". El nombre y la dirección escritos se conservan. |
| 7 | Guardar `Trabajo` (dirección B) y tres lugares más. | Con 5 guardados, el formulario se reemplaza por "Podés guardar hasta 5 lugares. Quitá uno para agregar otro.". |
| 8 | Tocar "Quitar" en uno de los cinco. | Sale de la lista y el formulario vuelve a aparecer. |
| 9 | Ir a `/viajar`. | Debajo de "Destino" aparece "Favoritos" con los 4 lugares (nombre y dirección), en el orden en que se cargaron, y debajo "Recientes" si hay. |
| 10 | Tocar "Trabajo" con el origen ya cargado. | Pasa a "Confirmar viaje" con la dirección B como destino, con ruta y tarifa, sin haber escrito nada. |
| 11 | Confirmar ese viaje, cancelarlo y volver a P04. | "Trabajo" sigue en "Favoritos" y la dirección B **no** aparece en "Recientes". |
| 12 | En "Confirmar viaje", tocar "Cambiar destino". | Vuelve a P04 con el destino vacío y "Favoritos" visible otra vez. |
| 13 | Entrar con **otro** pasajero a `/viajar` y a `/perfil/favoritos`. | No ve los lugares de P. |
| 14 | Como conductor, abrir `/perfil` y después entrar por la URL a `/perfil/favoritos`. | No aparece la opción en el menú; la URL redirige a `/perfil`. |

## Criterios de aceptación

- [ ] La tabla `lugares_favoritos` existe con RLS activado y policies de `select`, `insert` y `delete` por `usuario_id`; no tiene policy de `update`.
- [ ] La migración 0027 corre dos veces seguidas sin error.
- [ ] Un pasajero puede guardar un lugar con nombre y dirección desde `/perfil/favoritos`, y lo ve en la lista con ambos datos.
- [ ] El nombre se acepta sólo entre 2 y 30 caracteres, con el mismo mensaje al salir del campo y al enviar.
- [ ] No se puede guardar un lugar sin haber elegido una dirección del buscador.
- [ ] Un pasajero no puede tener dos lugares con el mismo nombre, sin distinguir mayúsculas; el error aparece debajo de "Nombre".
- [ ] Con 5 lugares guardados no se puede agregar otro desde la app: el formulario no se muestra y `agregarFavorito` lo rechaza.
- [ ] "Quitar" borra el lugar y deja de aparecer en `/perfil/favoritos` y en P04.
- [ ] En P04, un pasajero con favoritos ve "Favoritos" debajo del campo "Destino" y arriba de "Recientes"; sin favoritos, la sección no aparece.
- [ ] Tocar un favorito lo elige como destino sin escribir: con origen cargado se pasa a "Confirmar viaje" con la ruta y la tarifa de ese lugar.
- [ ] Con un destino ya elegido, "Favoritos" no se muestra; al volver a dejar el destino vacío, reaparece.
- [ ] Un reciente con la misma dirección que un favorito no aparece en "Recientes".
- [ ] Un usuario nunca ve ni borra lugares de otro usuario, ni por la pantalla ni consultando la tabla directamente.
- [ ] La opción "Lugares favoritos" sólo aparece en el menú del pasajero, y `/perfil/favoritos` redirige a `/perfil` para cualquier otro rol.
- [ ] El autocompletado de "Destino" y la lista "Recientes" siguen funcionando igual que antes.
- [ ] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** los favoritos se cargan y se borran en una pantalla propia, `/perfil/favoritos`. **No:** un botón "Guardar" en "Confirmar viaje" (P05), ni las dos cosas. Decisión del usuario: no toca el flujo de pedir un viaje y repite el esquema de `/perfil/contactos`.
- **Sí:** nombre libre de 2 a 30 caracteres, hasta 5 lugares. **No:** sólo "Casa" y "Trabajo" fijos, ni una lista sin tope. Decisión del usuario: 5 filas entran en el panel de P04 sobre el mapa y el nombre libre cubre "Gimnasio" o "Lo de mamá".
- **Sí:** sólo agregar y borrar. **No:** editar un favorito. Decisión del usuario; mismo criterio que los contactos de confianza (Spec 12).
- **Sí:** los favoritos se eligen sólo como destino, arriba de "Recientes", sin repetir en "Recientes" un lugar que ya es favorito. **No:** ofrecerlos también como origen. Decisión del usuario: el origen sale del GPS (Spec 03), igual que se resolvió en el Spec 16.
- **Sí:** tabla propia `lugares_favoritos`. **No:** derivarlos de `trips` como los recientes. Un favorito tiene nombre y no depende de haber viajado ahí.
- **Sí:** RLS por `usuario_id` con `select`, `insert` y `delete` directos. **No:** RPC `security definer`. No hay lectura cruzada entre usuarios, igual que en `contactos_confianza`.
- **Sí:** el rol se controla en la pantalla (menú y redirección). **No:** en la base. La tabla acepta filas de cualquier usuario autenticado, como `contactos_confianza`; sólo el pasajero tiene dónde usarlas.
- **Sí:** índice único `(usuario_id, lower(nombre))` y `CHECK` del largo del nombre en la base. **No:** dejarlo sólo en la app. Es la red de seguridad que ya usan los Specs 19 a 21, y el `23505` es la forma de detectar el nombre repetido sin una consulta previa.
- **Sí:** el tope de 5 se controla en `agregarFavorito`, y `getFavoritos()` lee con `limit 5`. **No:** trigger o policy que lo garantice en la base. Quien se salte la app sólo guarda filas propias de más, que P04 no muestra; no afecta a otros usuarios.
- **Sí:** `validarNombreLugar` sin restricción de caracteres. **No:** la regla de nombre de persona. Un lugar puede llamarse "Depto 3B" o "Club (cancha 2)".
- **Sí:** exigir una dirección elegida de las sugerencias del buscador, con sus coordenadas. **No:** aceptar texto libre y geocodificarlo al pedir el viaje. Así el favorito se usa sin depender de que Photon responda, como los recientes.
- **Sí:** reutilizar `app/viajar/buscador-direccion.tsx` importándolo desde `/perfil/favoritos`. **No:** moverlo a `components/` ni escribir otro buscador. Es el cambio mínimo; moverlo es un refactor aparte.
- **Sí:** al elegir un favorito, el destino lleva la **dirección** como etiqueta. **No:** el nombre del favorito. `destino_label` es lo que ve el conductor y lo que queda en el historial: "Casa" no le dice nada a otra persona.
- **Sí:** orden por fecha de carga, el más viejo primero. **No:** orden alfabético ni por uso. Es el orden de `contactos_confianza`, y lo primero que se carga suele ser lo más usado.
- **Sí:** cargar los favoritos en el servidor (`page.tsx`) y pasarlos por prop. **No:** pedirlos desde el cliente. Llegan con el primer render, igual que los recientes (Spec 16).
- **Sí:** migración `0027`. **No:** `0026`. Ese número ya lo usa la corrección de `resolver_reclamo` del Spec 22; desde acá el número de migración deja de coincidir con el del spec.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Con 5 favoritos y 3 recientes, el panel de P04 queda alto y tapa el mapa en pantallas chicas. | El panel ya tiene alto máximo con scroll, y el margen inferior del mapa crece con las dos listas. Las listas desaparecen en cuanto se elige un destino. |
| Dos envíos casi simultáneos pasan el control del tope y quedan 6 lugares. | `getFavoritos()` lee con `limit 5`, así que P04 y la pantalla muestran 5. Aceptado: sólo afecta al propio usuario. |
| El mismo lugar guardado como favorito y elegido después con otra sugerencia del geocoder (etiqueta levemente distinta) aparece en las dos listas. | Aceptable: son dos textos distintos para el usuario, mismo criterio que el Spec 16. |
| Quitar de "Recientes" los que son favoritos deja menos de 3 recientes a la vista. | Aceptable: esos lugares siguen estando un renglón más arriba, en "Favoritos". |
| El pasajero escribe la dirección pero no toca ninguna sugerencia, y cree que la eligió. | El error "Elegí una dirección de la lista." aparece debajo del buscador al enviar. |
| `buscador-direccion.tsx` cambia pensando sólo en P04 y rompe `/perfil/favoritos`. | Es un solo componente con dos usos; `npm run build` detecta un cambio de props. |

## Lo que **no** entra en este spec

- Editar un favorito.
- Guardar un favorito desde "Confirmar viaje" o desde un reciente.
- Favoritos como origen.
- Elegir el punto en el mapa.
- Íconos por lugar o lugares fijos "Casa" y "Trabajo".
- Reordenar los favoritos.
- Favoritos para conductor, remisería o soporte.
- Mostrar el nombre del favorito en el viaje.
- Tope de 5 garantizado en la base.

Cada uno de esos, si aterriza, va en su propio spec.
