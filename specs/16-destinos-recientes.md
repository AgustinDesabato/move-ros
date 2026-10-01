# SPEC 16 — Destinos recientes

> **Estado:** implementado
> **Depende de:** SPEC 03, SPEC 04
> **Fecha:** 2026-10-01
> **Objetivo:** Que el pasajero elija su destino más rápido: ve sus últimos destinos debajo del campo "Destino" y con un toque selecciona uno, sin volver a escribirlo. Cubre la lista de recientes de P04.

Hoy el único camino para elegir destino es el autocompletado del Spec 03: escribir al menos 3 letras, esperar a Photon y tocar una sugerencia. Pero cada viaje que el pasajero solicitó ya dejó guardado su destino en `trips` (`destino_label`, `destino_lat`, `destino_lng`, desde el Spec 04), así que la app ya sabe a dónde suele ir. Este spec sólo lee ese dato y lo ofrece en P04 (`app/viajar/selector-viaje.tsx`) como una lista corta "Recientes" debajo del campo de destino. Tocar un reciente equivale a haber elegido esa dirección en el autocompletado: fija el destino con sus coordenadas guardadas, sin pasar por el geocoder.

No hay tabla ni migración nueva: la lista se **deriva** de `trips` en cada carga de `/viajar`.

## Alcance

**Incluye:**

- **Server Action** `destinosRecientes()` (`app/actions/viaje.ts`, editado): lee los últimos viajes del pasajero logueado (los más nuevos primero), se queda con los destinos **distintos** y devuelve como máximo 3, cada uno como `Place` (`{ lat, lng, label }`, el tipo que ya usa el selector). Si no hay sesión o la consulta falla, devuelve `[]`.
- **`app/viajar/page.tsx`** (editado): cuando no hay viaje activo, pide `destinosRecientes()` y se los pasa a `SelectorViaje` como prop `recientes`. Con viaje activo no se consultan (esa pantalla no los muestra).
- **`app/viajar/selector-viaje.tsx`** (editado): lista **"Recientes"** debajo del campo "Destino" de P04. Cada ítem es un botón con el ícono de reloj y la dirección; al tocarlo se elige como destino (`setDestino`). La lista se muestra sólo mientras no hay un destino elegido y sólo si hay al menos un reciente.
- **Encuadre del mapa**: el margen inferior que P04 le pasa al mapa crece con la lista, para que el panel más alto no tape el marcador de origen.

**Fuera de alcance (para specs futuros):**

- Lugares favoritos o con nombre ("Casa", "Trabajo") cargados por el pasajero.
- Borrar u ocultar un destino de la lista de recientes.
- Orígenes recientes: el origen sale del GPS (Spec 03); sólo se ofrecen destinos.
- Ordenar por frecuencia ("más usados") en vez de por fecha.
- Recientes para el conductor o la remisería: P04 es sólo del pasajero.
- Guardar búsquedas que no terminaron en una solicitud de viaje (no dejan fila en `trips`).

## Modelo de datos

Sin cambios de esquema y **sin migración**. Se lee de `trips` (Spec 04):

| Columna | Uso |
| --- | --- |
| `pasajero_id` | filtra los viajes propios |
| `destino_label`, `destino_lat`, `destino_lng` | el lugar que se ofrece como reciente |
| `created_at` | orden: el más nuevo primero |

La policy "El pasajero ve sus viajes" (`for select using (auth.uid() = pasajero_id)`, Spec 04) ya permite esta lectura; no hace falta una RPC ni una policy nueva. El índice `trips_pasajero_estado_idx (pasajero_id, estado)` cubre el filtro por pasajero.

**Tipos TypeScript:** ninguno nuevo. La action devuelve `Place[]` (`lib/geocode.ts`), el mismo tipo que produce el autocompletado y que consume `setDestino`.

```ts
// app/actions/viaje.ts
export async function destinosRecientes(): Promise<Place[]>;
```

Reglas de la lista:

- **Fuente:** los últimos 30 viajes del pasajero, en cualquier estado (incluye cancelados).
- **Sin repetidos:** dos viajes al mismo lugar cuentan una sola vez. Se comparan por `destino_label` sin distinguir mayúsculas ni espacios al borde; queda el del viaje más nuevo (con sus coordenadas).
- **Tope:** 3 destinos.

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Commit 1 — este spec.** `specs/16-destinos-recientes.md`.

2. **Server Action.** En `app/actions/viaje.ts`: `destinosRecientes()`. Consulta `trips` (`destino_label, destino_lat, destino_lng`) del usuario logueado, `order created_at desc`, `limit 30`; dedupe por etiqueta normalizada; corta en 3. *Verificación:* `npm run lint` pasa.

3. **Lista en P04.** `app/viajar/page.tsx` pide `destinosRecientes()` (sólo sin viaje activo) y pasa `recientes` a `SelectorViaje`. En `app/viajar/selector-viaje.tsx`: debajo del `BuscadorDireccion` de destino, si `!destino && recientes.length > 0`, un bloque con el título "Recientes" (`seccionCls`) y una `<ul>` de botones (ícono `IconoReloj` + dirección, mismo estilo de fila que las sugerencias del buscador) que llaman a `setDestino(r)`. El margen inferior del mapa suma el alto de la lista. *Verificación:* con viajes previos, la lista aparece y al tocar un ítem se pasa a "Confirmar viaje" con ese destino.

4. **Prueba end-to-end.** Ver "Caso de prueba". *Verificación:* todos los criterios de aceptación, más `npm run build` y `npm run lint`.

## Caso de prueba

Precondición: `npm run dev` corriendo en `http://localhost:3000` y un usuario **pasajero** con el perfil completo. No hace falta un conductor: los viajes se solicitan y se cancelan.

| # | Paso | Resultado esperado |
| --- | --- | --- |
| 1 | Con un pasajero **sin ningún viaje**, entrar a `/viajar`. | El panel "¿A dónde vas?" muestra Origen y Destino; **no** aparece "Recientes". |
| 2 | Escribir un destino A (p. ej. "Terminal de Ómnibus"), elegir la sugerencia, confirmar el viaje y **cancelarlo**. | Vuelve al selector. Debajo de "Destino" aparece "Recientes" con A. |
| 3 | Repetir con un destino B y después con un destino C. | "Recientes" lista C, B, A — el más nuevo arriba. |
| 4 | Tocar B en "Recientes" (con el origen ya cargado por GPS o a mano). | Pasa a "Confirmar viaje" con B como destino, sin haber escrito nada; el mapa muestra la ruta y la tarifa. |
| 5 | Confirmar ese viaje a B y cancelarlo. | "Recientes" lista B, C, A: B subió al primer lugar y **no** aparece dos veces. |
| 6 | Solicitar y cancelar un viaje a un cuarto destino D. | "Recientes" lista D, B, C: son 3 como máximo; A ya no aparece. |
| 7 | En "Confirmar viaje", tocar la flecha "Cambiar destino". | Vuelve a P04 con el destino vacío y "Recientes" visible otra vez. |
| 8 | Negar el permiso de ubicación (origen vacío) y tocar un reciente. | El campo "Destino" queda completado con esa dirección, "Recientes" se oculta y la pantalla sigue en P04 esperando el origen. |
| 9 | Entrar con **otro** pasajero. | No ve los destinos del primero (ve los suyos, o nada). |
| 10 | Entrar como conductor a `/viajar`. | Redirige a `/conducir`, igual que antes. |

## Criterios de aceptación

- [ ] Un pasajero sin viajes previos no ve el bloque "Recientes" en P04.
- [ ] Un pasajero con viajes previos ve "Recientes" debajo del campo "Destino", con sus últimos destinos, el más nuevo primero.
- [ ] La lista muestra como máximo 3 destinos y no repite un mismo lugar.
- [ ] Tocar un reciente lo elige como destino sin escribir: con origen cargado se pasa a "Confirmar viaje" con la ruta y la tarifa de ese destino.
- [ ] Con un destino ya elegido, "Recientes" no se muestra; al volver a dejar el destino vacío, reaparece.
- [ ] El autocompletado del campo "Destino" sigue funcionando igual que antes.
- [ ] Un pasajero nunca ve destinos de otro pasajero.
- [ ] No hay migración nueva: `supabase/migrations/` queda igual.
- [ ] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** derivar los recientes de `trips`. **No:** una tabla `destinos_recientes` propia. El dato ya está guardado desde el Spec 04; una tabla aparte duplicaría estado y habría que mantenerla sincronizada.
- **Sí:** leer con un `select` directo apoyado en la policy "El pasajero ve sus viajes". **No:** una RPC `security definer`. No hay lectura cruzada entre usuarios: el pasajero lee sólo sus propias filas.
- **Sí:** contar los viajes en **cualquier estado**, incluidos los cancelados. **No:** sólo los finalizados. Una solicitud cancelada (p. ej. porque no había conductor) igual dice a dónde quería ir el pasajero, y es justo la que más probablemente vuelva a pedir.
- **Sí:** deduplicar por la etiqueta de la dirección. **No:** por coordenadas. El autocompletado devuelve la misma etiqueta para el mismo lugar, y es lo que el pasajero ve: dos filas con el mismo texto serían un repetido aunque difieran en un decimal.
- **Sí:** tope de 3. **No:** una lista larga con scroll. El panel de P04 vive sobre el mapa; 3 filas entran sin taparlo y cubren el caso típico (casa, trabajo, algún otro).
- **Sí:** cargar los recientes en el servidor (`page.tsx`) y pasarlos por prop. **No:** pedirlos desde el cliente al montar. Llegan con el primer render, sin parpadeo ni estado de carga, y `solicitarViaje`/`cancelarViaje` ya revalidan `/viajar`, así que la lista se refresca sola después de cada viaje.
- **Sí:** al tocar un reciente, usar las coordenadas guardadas. **No:** volver a geocodificar la etiqueta. Es más rápido y no depende de que Photon responda.
- **Sí:** ocultar "Recientes" cuando ya hay destino. **No:** dejarla siempre visible. Con el destino elegido la lista ya cumplió su función y sólo ocuparía panel.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El mismo lugar elegido con dos sugerencias distintas del geocoder (etiquetas levemente diferentes) aparece dos veces. | Aceptable: son dos textos distintos para el usuario. La comparación ignora mayúsculas y espacios al borde, que cubre el caso común. |
| Un pasajero con muchos viajes al mismo lugar podría agotar la ventana de 30 viajes con un solo destino y ver menos de 3 recientes. | Aceptable en el MVP: ve al menos su destino habitual. Si molesta, se amplía la ventana o se resuelve con un `distinct on` en una RPC. |
| La lista agranda el panel de P04 y puede tapar el marcador de origen en pantallas chicas. | El margen inferior del mapa crece según la cantidad de recientes; el panel ya tiene `max-h-[78dvh]` con scroll. |
| Las sugerencias del autocompletado y "Recientes" se muestran una debajo de la otra mientras el pasajero escribe. | Las sugerencias quedan pegadas al campo (arriba) y "Recientes" debajo, con su título; al elegir cualquiera de las dos, ambas listas desaparecen. |
| Una dirección cargada por error queda como reciente y no se puede quitar. | Sale sola de la lista después de 3 destinos más nuevos. Borrar recientes queda fuera de alcance. |

## Lo que **no** entra en este spec

- Favoritos o lugares con nombre ("Casa", "Trabajo").
- Borrar u ocultar un reciente.
- Orígenes recientes.
- Orden por frecuencia de uso.
- Historial de búsquedas que no llegaron a ser un viaje.

Cada uno de esos, si aterriza, va en su propio spec (los favoritos son el candidato natural).
