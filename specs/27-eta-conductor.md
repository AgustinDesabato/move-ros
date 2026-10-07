# SPEC 27 — ETA del conductor ("llega en X min") con OSRM

> **Estado:** aprobado
> **Depende de:** SPEC 04, SPEC 05, SPEC 06
> **Fecha:** 2026-10-06
> **Objetivo:** Que el pasajero vea en `/viajar` "Llega en X min" (viaje `aceptada`) o "Llegás en X min" (viaje `en_curso`), calculado con OSRM desde la última posición vigente del conductor.

El Spec 06 dejó explícitamente fuera de alcance el *"ETA dinámico ('llega en X min') calculado desde la posición del conductor"*. Este spec lo agrega reutilizando lo que ya existe: la posición del conductor que devuelve `datos_conductor` (con `ubic_vigente` calculado en el servidor, Spec 06) y el cliente de OSRM de `lib/osrm.ts` (Spec 04). No hay cambios de base de datos: el ETA se calcula bajo demanda y vive sólo en el estado de la pantalla del pasajero.

## Alcance

**Incluye:**

- `lib/osrm.ts`: nueva función `duracionOSRM(origen, destino): Promise<number | null>` que consulta OSRM con `overview=false` (sin geometría) y devuelve sólo la duración en segundos. `rutaOSRM` sigue funcionando igual; ambas comparten la misma consulta interna (URL base, `User-Agent`, timeout de 6s).
- `lib/osrm.ts`: la URL base se lee de `process.env.OSRM_URL` en cada llamada, con `https://router.project-osrm.org` como valor por defecto. Sirve para simular la caída de OSRM en el caso de prueba sin tocar código. Es sólo del servidor (sin prefijo `NEXT_PUBLIC_`) y no hace falta definirla en ningún entorno.
- `lib/despacho.ts`: dos constantes nuevas, `ETA_MS = 30_000` (intervalo de recálculo) y `ETA_VIGENCIA_MS = 60_000` (antigüedad máxima de un ETA que se sigue mostrando cuando el último cálculo falló).
- `app/actions/viaje.ts`: nueva Server Action `etaConductor(tripId): Promise<number | null>` que:
  - valida que el usuario logueado sea el pasajero del viaje y que el viaje esté `aceptada` o `en_curso`;
  - lee la posición del conductor con la RPC existente `datos_conductor` y devuelve `null` si `ubic_vigente` es `false` o faltan coordenadas;
  - toma como punto final el **origen** del viaje si está `aceptada` y el **destino** si está `en_curso`;
  - devuelve `duracionOSRM(posición del conductor, punto final)`, o `null` si OSRM falla.
- `lib/formato.ts`: nueva función `formatoEta(segundos, estado)`:
  - `segundos < 60` → `"Llegando"` (`aceptada`) / `"Llegando a destino"` (`en_curso`);
  - si no, minutos redondeados hacia arriba (`Math.ceil(segundos / 60)`): `"Llega en N min"` (`aceptada`) / `"Llegás en N min"` (`en_curso`).
- `app/viajar/viaje-pendiente.tsx` (P07):
  - estado nuevo `eta: { segundos: number; at: number } | null`;
  - mientras `trip.estado` sea `aceptada` o `en_curso`, se llama a `etaConductor` al entrar al estado y después cada `ETA_MS`, con un intervalo **separado** del poll de 5s (`POLL_MS`), que no cambia;
  - si el cálculo devuelve un número, se guarda junto con `at = Date.now()`; si devuelve `null`, se conserva el ETA anterior sólo si `Date.now() - at < ETA_VIGENCIA_MS`, y si no se descarta;
  - al pasar de `aceptada` a `en_curso`, el ETA anterior se descarta y se recalcula enseguida contra el destino;
  - el ETA se muestra en el `<span>` a la derecha del título del panel, donde hoy está `formatoKm(trip.distancia_m)`. Si no hay ETA o no hay posición vigente (`posConductor === null`), ese lugar sigue mostrando la distancia como hoy, y el aviso "Ubicando al conductor…" no cambia.

**Fuera de alcance (para specs futuros):**

- Dibujar en el mapa la ruta del conductor (polilínea conductor → origen/destino) o recalcularla en vivo.
- Mostrar el ETA al conductor en `/conducir`.
- Detectar que el conductor "llegó" (geocerca, aviso o notificación al pasajero); con menos de un minuto sólo se muestra "Llegando".
- Hora estimada de llegada ("21:43"); sólo se muestran minutos.
- Persistir el ETA en la base (columnas en `trips`) o compartirlo entre pestañas.
- Estimación sin OSRM (línea recta o velocidad promedio) cuando OSRM falla.
- Servidor OSRM propio o con tráfico; se sigue usando `router.project-osrm.org`.
- ETA mientras el viaje está `pendiente` (todavía no hay conductor asignado).

## Modelo de datos

Este spec **no introduce datos persistentes**: no hay migración ni cambios en `lib/supabase/types.ts`. El ETA se calcula a pedido y se guarda sólo en el estado de React de `viaje-pendiente.tsx`.

### `duracionOSRM` (`lib/osrm.ts`)

```ts
// Sólo la duración (segundos) de la ruta por calles, sin geometría
// (overview=false): para el ETA alcanza y la respuesta es mucho más liviana.
// Devuelve null ante error/timeout, igual que rutaOSRM.
export async function duracionOSRM(
  origen: LatLng,
  destino: LatLng,
): Promise<number | null>;
```

La URL es la misma que la de `rutaOSRM` cambiando `?overview=full&geometries=geojson` por `?overview=false`. La consulta HTTP (URL base, `User-Agent`, `AbortSignal.timeout(6000)`, parseo de `routes[0]`) se extrae a un helper interno que usan las dos funciones.

```ts
// URL base de OSRM. Se lee en cada llamada (no al cargar el módulo) para que
// cambiar OSRM_URL en .env.local tenga efecto sin reiniciar `npm run dev`.
const osrmBase = () => process.env.OSRM_URL ?? "https://router.project-osrm.org";
```

### Constantes (`lib/despacho.ts`)

```ts
// Spec 27: el ETA del conductor se recalcula con OSRM cada ETA_MS (no en cada
// poll de 5s, para no saturar el servidor público de OSRM). Si un cálculo
// falla, el último ETA se sigue mostrando mientras tenga menos de
// ETA_VIGENCIA_MS de antigüedad.
export const ETA_MS = 30_000;
export const ETA_VIGENCIA_MS = 60_000;
```

### `etaConductor` (`app/actions/viaje.ts`)

```ts
// Spec 27: segundos que le faltan al conductor para llegar al origen
// (aceptada) o al destino (en_curso), según OSRM. null si no aplica (otro
// estado, no es el pasajero del viaje), si la posición del conductor no está
// vigente o si OSRM falla.
export async function etaConductor(tripId: string): Promise<number | null>;
```

Flujo:

1. `supabase.auth.getUser()`; sin usuario → `null`.
2. `select estado, origen_lat, origen_lng, destino_lat, destino_lng from trips where id = tripId and pasajero_id = user.id`; si no hay fila o `estado` no es `aceptada`/`en_curso` → `null`.
3. `supabase.rpc("datos_conductor", { p_trip_id: tripId })`; si `ubic_vigente` es `false` o `ubic_lat`/`ubic_lng` son null → `null`. La RPC ya valida `pasajero_id = auth.uid()`, así que la posición sólo se usa dentro de un viaje del propio pasajero.
4. Punto final: origen si `aceptada`, destino si `en_curso`.
5. `return duracionOSRM({ lat: ubic_lat, lng: ubic_lng }, puntoFinal)`.

### `formatoEta` (`lib/formato.ts`)

```ts
// Spec 27: "Llega en 4 min" (aceptada) / "Llegás en 12 min" (en_curso).
// Con menos de un minuto: "Llegando" / "Llegando a destino".
export function formatoEta(
  segundos: number,
  estado: "aceptada" | "en_curso",
): string;
```

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Commit 1 — este spec.** `specs/27-eta-conductor.md`.

2. **OSRM sin geometría.** Extraer la consulta interna en `lib/osrm.ts`, leer la URL base de `OSRM_URL` y agregar `duracionOSRM`. *Verificación:* `npm run build` compila y pedir un viaje nuevo en `/viajar` sigue mostrando la ruta y la tarifa (así se comprueba que `rutaOSRM` no se rompió).

3. **Constantes y formato.** `ETA_MS` y `ETA_VIGENCIA_MS` en `lib/despacho.ts`; `formatoEta` en `lib/formato.ts`. *Verificación:* `npm run lint` pasa.

4. **Server Action.** `etaConductor` en `app/actions/viaje.ts`. *Verificación:* `npm run build` compila.

5. **UI en P07.** Estado `eta`, intervalo de `ETA_MS` separado del poll y reemplazo de la distancia junto al título en `app/viajar/viaje-pendiente.tsx`. *Verificación:* ver "Caso de prueba".

6. **Prueba end-to-end.** *Verificación:* todos los criterios de aceptación, más `npm run build` y `npm run lint`.

## Caso de prueba

Precondición: `npm run dev` en `http://localhost:3000`, sin `OSRM_URL` en `.env.local`. Una cuenta conductor (C) con perfil completo y en línea, y una cuenta pasajero (P), cada una en un navegador o perfil distinto. La posición de C se simula desde las DevTools de su navegador (⋮ → More tools → Sensors → Location → "Other…", cargando latitud y longitud).

Puntos fijos en Rosario (coordenadas aproximadas; lo que importa es el orden de distancias):

| Punto | Lugar | Latitud | Longitud |
| --- | --- | --- | --- |
| O | Origen: Monumento Nacional a la Bandera | -32.9477 | -60.6303 |
| D | Destino: Terminal de Ómnibus Mariano Moreno | -32.9426 | -60.6626 |
| C1 | Conductor lejos: Parque Independencia (~3 km de O) | -32.9575 | -60.6588 |
| C2 | Conductor intermedio: Plaza 25 de Mayo (~600 m de O) | -32.9469 | -60.6363 |
| C3 | Conductor al lado: Av. Belgrano frente al Monumento (~100 m de O) | -32.9480 | -60.6292 |

| # | Paso | Resultado esperado |
| --- | --- | --- |
| 1 | Como P, solicitar un viaje de O a D (buscar "Monumento a la Bandera" y "Terminal Mariano Moreno", o marcarlos en el mapa). | Mientras está `pendiente`, P06 no muestra ningún ETA. |
| 2 | Como C, simular la ubicación en C1, compartirla y aceptar la oferta. | En P07, junto a "Tu conductor está en camino", aparece "Llega en N min" en lugar de la distancia (con N alrededor de 5–8). |
| 3 | Como C, cambiar la ubicación simulada a C2. | En ≤30s el número de P baja (alrededor de 1–3 min). |
| 4 | Como C, cambiar la ubicación simulada a C3. | En ≤30s P ve "Llegando". Si OSRM devuelve 60s o más (porque ajusta el punto a la mano contraria de Av. Belgrano), acercar C3 hasta que dé menos de un minuto. |
| 5 | Como C, iniciar el viaje (con la ubicación todavía en C3). | P ve "Viaje en curso" y enseguida "Llegás en N min" calculado contra D (alrededor de 5–8 min), no "Llegando". |
| 6 | Agregar `OSRM_URL=http://127.0.0.1:9` a `.env.local` y guardar (Next recarga las variables sin reiniciar). Esperar ~45s. | El último ETA de P sigue visible (tiene menos de 60s). En la terminal de `npm run dev` no aparece ningún error sin manejar. |
| 7 | Mantener `OSRM_URL` así más de 60s en total. | El ETA desaparece y vuelve a verse la distancia del viaje. |
| 8 | Sacar `OSRM_URL` de `.env.local` y guardar. | En ≤30s vuelve a aparecer el ETA. |
| 9 | Como C, cerrar la pestaña de `/conducir` durante más de 30s. | P ve "Ubicando al conductor…" y la distancia; no se muestra ETA. |
| 10 | En la pestaña Network de P, contar las llamadas a `etaConductor` durante 2 minutos. | Unas 4 (una cada 30s), no una cada 5s. |

> En los pasos 6 a 8, el corte es del lado del **servidor** de Next porque `duracionOSRM` corre ahí; bloquear la URL desde las DevTools de P no tendría efecto. Si al guardar `.env.local` la pestaña de P se recarga sola, el ETA guardado se pierde y el paso 6 no es válido: en ese caso, volver a cargar el ETA sin `OSRM_URL`, y repetir 6 y 7 sin recargar la pestaña.

## Criterios de aceptación

- [ ] Con el viaje `aceptada` y la posición del conductor vigente, P07 muestra "Llega en N min" (o "Llegando" con menos de 60s) junto al título, en lugar de la distancia.
- [ ] Con el viaje `en_curso`, P07 muestra "Llegás en N min" (o "Llegando a destino"), calculado contra el destino del viaje.
- [ ] Los minutos se redondean hacia arriba (`Math.ceil`): 61s → "2 min".
- [ ] El ETA se recalcula cada 30s con una llamada aparte; el poll de 5s de `estadoViajeActivo` no llama a OSRM.
- [ ] La consulta a OSRM del ETA usa `overview=false`.
- [ ] Sin `OSRM_URL` definida, `lib/osrm.ts` usa `https://router.project-osrm.org`; con `OSRM_URL` definida, usa esa URL tanto para el ETA como para `rutaOSRM`.
- [ ] Si un cálculo falla, el último ETA se sigue mostrando mientras tenga menos de 60s; después se oculta y vuelve a verse la distancia.
- [ ] Sin posición vigente del conductor no se muestra ETA y "Ubicando al conductor…" se comporta igual que antes.
- [ ] Con el viaje `pendiente`, `finalizada` o `cancelada` no se calcula ni se muestra ETA.
- [ ] `etaConductor` devuelve `null` para un viaje que no es del usuario logueado.
- [ ] Pedir un viaje nuevo (ruta y tarifa con `rutaOSRM`) funciona igual que antes.
- [ ] `/conducir` no cambia.
- [ ] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** ETA en `aceptada` (conductor → origen) y en `en_curso` (conductor → destino), con la misma acción y cambiando sólo el punto final. **No:** sólo en `aceptada`. Una vez arriba del auto, al pasajero también le sirve saber cuánto falta, y el costo de implementarlo es casi nulo.
- **Sí:** Server Action propia (`etaConductor`) con su propio intervalo de 30s. **No:** calcularlo dentro de `estadoViajeActivo` en cada poll de 5s. El servidor público de OSRM pide no superar ~1 req/s; con 30s hay 6 veces menos llamadas por pasajero, y el poll de 5s, del que dependen el estado y el marcador, no suma la latencia de OSRM.
- **Sí:** el ETA vive sólo en el estado de React de P07. **No:** cachearlo en `trips` (`eta_s`/`eta_at`). Evita una migración y escrituras cada 30s. La desventaja es que dos pestañas del mismo pasajero calculan cada una por su lado, algo aceptable para el volumen actual.
- **Sí:** si un cálculo falla, se conserva el último ETA mientras tenga menos de 60s y después se oculta. **No:** ocultarlo enseguida ni caer a una estimación en línea recta. Un error aislado de OSRM no hace parpadear la UI, y un número inventado podría ser muy distinto del real por calles.
- **Sí:** `overview=false` (sólo duración). **No:** reutilizar `rutaOSRM` con `overview=full`. No se dibuja la polilínea, así que pedir la geometría sería tráfico de más cada 30s.
- **Sí:** minutos redondeados hacia arriba y "Llegando" con menos de 60s. **No:** `formatoMin` (redondeo al más cercano con piso 1). Para una llegada es mejor prometer de más que de menos; y "1 min" fijo mientras el auto ya está en la puerta se lee mal.
- **Sí:** el ETA reemplaza la distancia junto al título, y la distancia vuelve si no hay ETA. **No:** un renglón nuevo ni una burbuja sobre el mapa. No agrega elementos al panel y usa un lugar que hoy muestra un dato menos útil para quien espera.
- **Sí:** sólo lo ve el pasajero. **No:** mostrarlo también en `/conducir`. El conductor ya navega con su propia app, y sumarlo requeriría otra acción validada para su rol.
- **Sí:** la URL base de OSRM se puede cambiar con `OSRM_URL` (sólo servidor, con el servidor público como valor por defecto). **No:** simular la caída cortando la red de la máquina. Cortar la red también corta Supabase, y el poll de 5s falla al mismo tiempo que el ETA, lo que ensucia la prueba. De paso, la variable deja preparado el cambio a un servidor OSRM propio, aunque ese cambio no entra en este spec.
- **Numeración:** este spec es el 27 porque el 26 está reservado para otro spec del equipo.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El servidor público de OSRM (`router.project-osrm.org`) limita el uso o deja de responder. | Una llamada cada 30s por pasajero con viaje activo, sin geometría. Ante fallas, el último valor dura hasta 60s y después se vuelve a mostrar la distancia, que es lo que se ve hoy. Un servidor propio queda fuera de alcance. |
| OSRM no considera tráfico, así que el ETA puede quedar corto en horas pico. | Redondear hacia arriba compensa en parte. Es una estimación y se presenta como tal ("Llega en", sin hora exacta). |
| La posición del conductor se actualiza cada ~5s y el ETA cada 30s, así que el número puede estar hasta 30s desfasado del marcador. | Es aceptable para un número en minutos. Bajar `ETA_MS` es cambiar una constante si hiciera falta. |
| Al pasar de `aceptada` a `en_curso`, podría verse por un instante el ETA viejo, calculado contra el origen. | El efecto depende de `trip.estado`: al cambiar, se descarta el ETA anterior y se recalcula enseguida contra el destino. |
| La regla `react-hooks/set-state-in-effect` puede marcar el reseteo del ETA dentro del efecto. | Mismo criterio que ya usa el `tick` de `viaje-pendiente.tsx`: el `setState` ocurre dentro del callback asíncrono, o se usa el `eslint-disable-next-line` puntual que ya existe en ese archivo. |

## Lo que **no** entra en este spec

- Polilínea de la ruta del conductor en el mapa.
- ETA en `/conducir`.
- Detección de "el conductor llegó" y avisos al pasajero.
- Hora estimada de llegada.
- Persistencia del ETA en la base.
- Estimación alternativa sin OSRM.
- Servidor OSRM propio o con tráfico.

Cada uno de esos, si aterriza, va en su propio spec.
