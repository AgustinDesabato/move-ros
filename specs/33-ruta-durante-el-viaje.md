# SPEC 33 — Ruta trazada durante el viaje

> **Estado:** aprobado
> **Depende de:** SPEC 05, SPEC 06, SPEC 18, SPEC 27
> **Fecha:** 2026-10-29
> **Objetivo:** Que en `/viajar` (P07) y en `/conducir` se dibuje en el mapa la ruta por calles del conductor (al punto de encuentro con el viaje `aceptada`, al destino con el viaje `en_curso`), recalculada cada 30 s.

Hoy, con un viaje asignado, los dos mapas muestran sólo marcadores: origen, destino y conductor. El Spec 27 dejó explícitamente fuera "dibujar en el mapa la ruta del conductor (polilínea conductor → origen/destino) o recalcularla en vivo". Este spec la agrega.

Casi todo ya existe. Los dos motores de mapa (`mapa-vectorial.tsx` y `mapa-leaflet.tsx`, Spec 18) ya dibujan una ruta con la prop `ruta`. `rutaOSRM` (`lib/osrm.ts`) ya devuelve la polilínea. P07 ya llama a OSRM cada 30 s para el ETA (Spec 27). Falta pedir la geometría en esa misma llamada, sumar la llamada del lado del conductor y evitar que el mapa reencuadre en cada recálculo.

No hay migración ni cambios en `lib/supabase/types.ts`.

## Alcance

**Incluye:**

- **Pasajero, una sola consulta a OSRM.** La Server Action `etaConductor` (`app/actions/viaje.ts`) se reemplaza por `rutaConductor(tripId): Promise<Ruta | null>`. Hace las mismas validaciones que antes, pero devuelve `rutaOSRM(posición del conductor, punto final)`, con la geometría completa. P07 saca el ETA de `ruta.duracionS` y la línea de `ruta.puntos`. Sigue habiendo una sola llamada a OSRM cada `ETA_MS` por pasajero.
- **`lib/osrm.ts`:** se borra `duracionOSRM`, que sólo usaba `etaConductor`. `consultarOSRM`, `osrmBase()` y `rutaOSRM` no cambian.
- **P07** (`app/viajar/viaje-pendiente.tsx`): el estado `eta` pasa a guardar la ruta completa (`{ ruta, at, estado }`). El intervalo, la vigencia de 60 s y el texto del ETA se comportan igual que en el Spec 27. Mientras haya una ruta vigente para el estado actual y posición vigente del conductor, el mapa recibe `ruta={ruta.puntos}`.
- **Conductor** (`app/conducir/panel-conductor.tsx`): con un viaje `aceptada` o `en_curso`, pide la ruta con `obtenerRuta` (`lib/ruteo.ts`, el proxy `/api/ruteo`). Va desde su posición local (`posConductor`, la de `watchPosition`) hasta el origen (`aceptada`) o el destino (`en_curso`). La pide apenas tiene posición, después cada `ETA_MS` y enseguida al pasar de `aceptada` a `en_curso`. El mapa recibe `ruta={ruta.puntos}`.
- **Encuadre por tramo.** `PropsMapa` (`app/viajar/mapa.tsx`) suma la prop opcional `tramo?: string`. Si llega, el `Encuadre` de los dos motores encuadra a la ruta sólo la primera vez que llega una ruta para ese `tramo`. Los recálculos siguientes del mismo tramo redibujan la línea sin mover la cámara. Sin `tramo` (el selector de viaje de `/viajar`), todo sigue como hoy. P07 pasa `tramo={trip.estado}`. `/conducir` pasa la clave del tramo, `${viaje.id}:${viaje.estado}`.
- **Fallas.** Las mismas reglas que el ETA del Spec 27, en las dos vistas:
  - Si un recálculo falla, la última ruta se sigue dibujando mientras tenga menos de `ETA_VIGENCIA_MS` (60 s). Después se borra.
  - Sin posición del conductor (pasajero: `posConductor === null`; conductor: sin fix todavía), no se dibuja ninguna ruta.
  - Una ruta calculada para otro estado (por ejemplo, la de `aceptada` justo después de iniciar el viaje) no se dibuja.

**Fuera de alcance (para specs futuros):**

- Dibujar también el recorrido del viaje (origen → destino) en gris mientras el conductor va al punto de encuentro.
- ETA para el conductor en `/conducir` (sigue fuera, como en el Spec 27).
- Ruta en la oferta entrante (P11) o en P06 (buscando conductor).
- Recortar la parte ya recorrida de la línea, o moverla con cada fix del GPS entre recálculos.
- Recalcular la ruta cuando el conductor se desvía, antes de los 30 s.
- Cambiar el color o el estilo de la línea según el tramo.
- Servidor OSRM propio o con tráfico.

## Modelo de datos

Este spec no introduce datos persistentes. La ruta vive sólo en el estado de React de cada pantalla.

### `rutaConductor` (`app/actions/viaje.ts`, reemplaza a `etaConductor`)

```ts
// Spec 33: ruta por calles del conductor al origen (aceptada) o al destino
// (en_curso). De ella salen el ETA (duracionS, Spec 27) y la línea del mapa
// (puntos). null si no aplica, si la posición del conductor no está vigente o
// si OSRM falla. Se llama cada ETA_MS, aparte del poll de 5s.
export async function rutaConductor(tripId: string): Promise<Ruta | null>;
```

Mismo flujo que `etaConductor` (Spec 27, pasos 1 a 4). Sólo cambia el último paso: `return rutaOSRM(posición del conductor, puntoFinal)`.

### Estado en P07 (`viaje-pendiente.tsx`)

```ts
const [rutaViva, setRutaViva] = useState<{
  ruta: Ruta;
  at: number;
  estado: EstadoConEta;
} | null>(null);
```

- `textoEta` = `formatoEta(rutaViva.ruta.duracionS, rutaViva.estado)`, con las mismas condiciones que hoy (posición vigente y `rutaViva.estado === trip.estado`).
- `ruta` del mapa = `rutaViva.ruta.puntos` con esas mismas condiciones. Si no se cumplen, `undefined`.

### Estado en `/conducir` (`panel-conductor.tsx`)

```ts
// Clave del tramo: `${viaje.id}:${viaje.estado}`. Una ruta sólo se dibuja si
// su clave coincide con la del viaje actual.
const [rutaViaje, setRutaViaje] = useState<{
  puntos: LatLng[];
  at: number;
  clave: string;
} | null>(null);
```

- El efecto depende de la clave del tramo y de si hay posición (`posConductor !== null`). No depende de la posición misma, para no reiniciar el intervalo a cada fix. La posición actual se lee de un `ref`.
- Ante un `null` de `obtenerRuta`, la ruta anterior queda mientras tenga menos de `ETA_VIGENCIA_MS`.
- Como en el Spec 27, no hay `setState` síncrono dentro del efecto. Una ruta de otro tramo simplemente no se muestra porque su `clave` no coincide.

### Encuadre (`mapa-vectorial.tsx` y `mapa-leaflet.tsx`)

```ts
export type PropsMapa = {
  // …lo de antes…
  // Spec 33: si llega, la ruta se encuadra sólo la primera vez que aparece para
  // este tramo; los recálculos del mismo tramo no mueven la cámara.
  tramo?: string;
};
```

`Encuadre` guarda en un `ref` el último `tramo` para el que encuadró una ruta. Cuando cambia `ruta`:

- Si `tramo` está definido y es igual al guardado, no hace nada.
- Si no, encuadra como hoy y guarda el `tramo`.

El reencuadre que mantiene visible al conductor (segundo efecto de `Encuadre`) no cambia.

### Constantes

Se reusan `ETA_MS` (30 s) y `ETA_VIGENCIA_MS` (60 s) de `lib/despacho.ts`. Se actualiza su comentario para decir que también rigen la ruta.

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Commit 1 — este spec.** `specs/33-ruta-durante-el-viaje.md`.
2. **Encuadre por tramo.** Prop `tramo` en `PropsMapa`, y el `ref` en el `Encuadre` de `mapa-vectorial.tsx` y `mapa-leaflet.tsx`. *Verificación:* `npm run build` compila. Pedir un viaje nuevo en `/viajar` sigue encuadrando la ruta como antes.
3. **Ruta del pasajero.** `rutaConductor` reemplaza a `etaConductor`. Se borra `duracionOSRM`. P07 guarda la ruta, saca el ETA de ella y pasa `ruta` y `tramo` al mapa. Se actualiza el comentario de `ETA_MS`. *Verificación:* filas 1 a 4 del caso de prueba.
4. **Ruta del conductor.** Estado `rutaViaje`, el efecto con su intervalo y `ruta`/`tramo` en el mapa de `panel-conductor.tsx`. *Verificación:* filas 5 a 7 del caso de prueba. `npm run lint` y `npm run build` pasan.
5. **Prueba end-to-end.** Ver "Caso de prueba". *Verificación:* todos los criterios de aceptación.

## Caso de prueba

Precondición: `npm run dev` en `http://localhost:3000`. Un conductor (C) en línea y un pasajero (P), en navegadores distintos. La posición de C se simula desde las DevTools (Sensors → Location). Se usan los puntos del Spec 27: O (Monumento a la Bandera), D (Terminal Mariano Moreno), C1 (Parque Independencia) y C2 (Plaza 25 de Mayo).

| # | Paso | Resultado esperado |
| --- | --- | --- |
| 1 | Como P, pedir un viaje de O a D. | En P06 (buscando conductor) no hay ruta dibujada. |
| 2 | Como C, con la ubicación en C1, aceptar la oferta. Mirar P. | En P07 aparece una línea azul de C1 a O y el mapa la encuadra. "Llega en N min" se ve como en el Spec 27. |
| 3 | Como C, mover la ubicación a C2. Mirar P durante 30 s, sin tocar el mapa. | En ≤30 s la línea pasa a salir de C2. La cámara no se mueve al recalcular (salvo que el auto salga del cuadro). |
| 4 | En la pestaña Network de P, contar las llamadas a `rutaConductor` durante 2 minutos. | Unas 4. No hay ninguna llamada a `etaConductor`. |
| 5 | Mirar C en `/conducir`. | Hay una línea de C2 a O y el mapa la encuadra. |
| 6 | Como C, "Iniciar viaje". | En C y en P la línea pasa a ir de C2 a D, y el mapa encuadra ese tramo nuevo una vez. En ningún momento se ve la línea vieja (a O) con el viaje en curso. |
| 7 | Como C, cambiar temporalmente en `lib/osrm.ts` la URL por defecto de `osrmBase()` a `"http://127.0.0.1:9"` y guardar. Esperar más de 60 s. | Durante el primer fallo la línea sigue en las dos vistas. Pasados 60 s desde el último cálculo bueno, desaparece y quedan sólo los marcadores. P vuelve a ver la distancia en lugar del ETA. |
| 8 | Revertir `lib/osrm.ts` (`git checkout -- lib/osrm.ts`). | En ≤30 s vuelven la línea y el ETA. |
| 9 | Como C, cerrar la pestaña de `/conducir` más de 30 s. | P ve "Ubicando al conductor…", sin línea y sin ETA. |
| 10 | Como C, finalizar el viaje. | Ninguna de las dos pantallas muestra la línea. |
| 11 | Como P, armar un viaje nuevo en `/viajar` (sin pedirlo) y cambiar el destino. | La ruta del selector se dibuja y se reencuadra igual que antes de este spec. |

## Criterios de aceptación

- [ ] Con el viaje `aceptada`, P07 y `/conducir` dibujan la ruta por calles del conductor al origen.
- [ ] Con el viaje `en_curso`, las dos vistas dibujan la ruta del conductor al destino.
- [ ] En P06, en la oferta entrante (P11) y sin viaje no se dibuja ninguna ruta del conductor.
- [ ] La ruta se recalcula cada 30 s. En P07 sale de la misma llamada que el ETA: no hay dos llamadas a OSRM por recálculo.
- [ ] El ETA de P07 se ve y se comporta igual que en el Spec 27.
- [ ] Un recálculo del mismo tramo no mueve la cámara. El mapa encuadra la ruta sólo al aparecer la primera de cada tramo.
- [ ] Al pasar de `aceptada` a `en_curso` no se dibuja la ruta del tramo anterior.
- [ ] Si OSRM falla, la última ruta se mantiene hasta 60 s y después se borra.
- [ ] Sin posición del conductor no se dibuja ruta.
- [ ] El selector de viaje de `/viajar` (ruta y tarifa antes de pedir) funciona y encuadra igual que antes.
- [ ] El respaldo Leaflet (Spec 18) dibuja la ruta y respeta el encuadre por tramo igual que el mapa vectorial.
- [ ] `duracionOSRM` y `etaConductor` ya no existen.
- [ ] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** una sola consulta a OSRM en P07, con geometría, de la que salen el ETA y la línea. **No:** dejar `etaConductor` y sumar otra llamada para la ruta. Decisión del usuario: el servidor público de OSRM pide ~1 req/s, y duplicar las llamadas por pasajero va en contra de eso. Revierte la decisión "`overview=false`" del Spec 27: ahora la geometría sí se usa.
- **Sí:** encuadrar la ruta sólo al aparecer la primera de cada tramo. **No:** reencuadrar en cada recálculo. Decisión del usuario: el mapa saltaría cada 30 s aunque el usuario lo esté mirando o haya hecho zoom.
- **Sí:** el conductor pide su ruta al proxy `/api/ruteo` con su posición local. **No:** una Server Action nueva que lea su posición de la base. Decisión del usuario: el conductor ya tiene su posición en el navegador, más fresca que la reportada, y el proxy ya existe.
- **Sí:** las mismas reglas de falla que el ETA (60 s de vigencia, sin posición no hay ruta). **No:** dejar la última ruta indefinidamente. Decisión del usuario: una línea vieja que sale de donde el auto ya no está confunde más que no mostrar nada.
- **Sí:** sólo el tramo actual. **No:** sumar el recorrido del viaje en gris. Decisión del usuario: no cambia la forma de los mapas (una sola línea) ni suma consultas.
- **Sí:** en `/conducir` sólo se suma la línea. **No:** sumar también el ETA. Decisión del usuario: el Spec 27 lo dejó fuera y sigue sin pedirse.
- **Sí:** `tramo` es una prop opcional. **No:** cambiar el encuadre para todos los usos del mapa. El selector de viaje de `/viajar` sí necesita reencuadrar cada vez que cambia la ruta (cambiar el destino da otra ruta).
- **Sí:** borrar `duracionOSRM`. **No:** dejarla sin uso. Su único llamador era `etaConductor`.
- **Sí:** reusar `ETA_MS` y `ETA_VIGENCIA_MS`. **No:** constantes nuevas para la ruta. La ruta y el ETA salen de la misma llamada, así que tienen que ir al mismo ritmo.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La respuesta de OSRM con geometría pesa más que la de `overview=false`. Ahora se pide cada 30 s por pasajero, más otra por conductor. | Son unos pocos KB por llamada. Es la misma consulta que ya hace el selector de viaje. |
| Entre recálculos, el marcador del conductor se aleja del inicio de la línea (hasta 30 s de desfase). | Aceptado: recortar la línea con cada fix queda fuera de alcance. Bajar `ETA_MS` es cambiar una constante. |
| Dos llamadas a OSRM por viaje cada 30 s (una del pasajero, otra del conductor). | Con el volumen actual sigue muy lejos de 1 req/s. Si creciera, la salida es un servidor OSRM propio (fuera de alcance). |
| El reencuadre por tramo podría no disparar si la primera ruta del tramo llega vacía. | `rutaOSRM` devuelve `null` si no hay geometría, y una ruta `null` no se guarda como encuadrada. |
| La regla `react-hooks/set-state-in-effect` en el efecto del conductor. | Mismo patrón que el Spec 27: el `setState` ocurre dentro del callback asíncrono, y una ruta de otro tramo se descarta por su `clave` al renderizar. |

## Lo que **no** entra en este spec

- Recorrido del viaje en gris durante `aceptada`.
- ETA en `/conducir`.
- Ruta en P06 o en la oferta entrante.
- Recortar o mover la línea entre recálculos.
- Recálculo por desvío.
- Estilos distintos por tramo.
- Servidor OSRM propio.

Cada uno de esos, si aterriza, va en su propio spec.
