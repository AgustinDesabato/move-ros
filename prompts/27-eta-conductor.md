# Prompts — Spec 27: ETA del conductor ("llega en X min") con OSRM

Prompts más relevantes de la sesión con Claude Code que llevó a este spec, en orden cronológico. El resto de la conversación no se incluye por no ser específico de este spec: instalar las skills `spec` y `spec-impl`, cambiar a `develop` y actualizarla, y levantar y apagar el servidor.

## 1. Arranque del spec

> necesito hacer el spec 27

Claude leyó la skill `spec` (`.claude/skills/spec/SKILL.md`) y siguió su flujo. Buscó el Spec 27 en `specs/`, en las ramas y en `prompts/`, y no lo encontró: el último era el 25 y no había ningún 26. Pidió la consigna en una sola oración y preguntó con qué número guardarlo.

## 2. Consigna del spec (la más importante)

> "El pasajero ve "llega en X min", calculado con OSRM desde la posición del conductor."

Antes de preguntar, Claude revisó:
- El Spec 06 (ubicación en vivo), que había dejado el ETA explícitamente fuera de alcance.
- El Spec 25, para tomar el formato de los specs recientes.
- `lib/osrm.ts`, `app/api/ruteo/route.ts`, `estadoViajeActivo` y la pantalla P07 (`app/viajar/viaje-pendiente.tsx`).

Así vio que la posición del conductor ya llegaba al pasajero con `datos_conductor` (con `ubic_vigente` calculado en el servidor) y que OSRM ya se usaba para la ruta y la tarifa.

## 3. Preguntas de diseño

Respuestas elegidas en dos bloques:
- Estados: **`aceptada` y `en_curso`**. "Llega en" hasta el origen y "Llegás en" hasta el destino.
- Frecuencia: **cada 30s, con una Server Action aparte** (`etaConductor`). El poll de 5s no cambia, para no saturar el servidor público de OSRM.
- Si OSRM falla: **se conserva el último valor hasta 60s** y después se oculta.
- Numeración: **27**, porque el 26 está reservado para otra persona del equipo.
- UI: **junto al título del panel**, en el lugar de la distancia.
- Formato: **minutos redondeados hacia arriba**, y "Llegando" con menos de un minuto.
- Polilínea de la ruta del conductor: **no**, sólo el número (con `overview=false`).
- ETA para el conductor en `/conducir`: **no**, sólo lo ve el pasajero.

Con eso Claude escribió `specs/27-eta-conductor.md` completo, en estado Borrador.

## 4. Ajuste del caso de prueba

> necesito hacer el caso de prueba

El spec todavía no estaba implementado, así que no había nada que probar. Se eligió ajustar primero el caso de prueba del spec:
- Corte de OSRM: **variable `OSRM_URL`**, que `lib/osrm.ts` lee en cada llamada y que por defecto apunta al servidor público.
- **Coordenadas fijas de Rosario** para la prueba. Origen: Monumento a la Bandera. Destino: Terminal Mariano Moreno. Tres posiciones del conductor a distinta distancia.

> aprobalo y commitealo

Spec en estado `aprobado`, commiteado y pusheado a `develop`.

## 5. Implementación

> mergea la spec 27

No había rama del spec: el commit estaba en `develop` y todavía no había código. Se eligió implementarlo con la skill `spec-impl`.

Claude creó la rama `spec-27-eta-conductor` y siguió el plan paso a paso, frenando después de cada uno para revisar el diff:
- Paso 2, `lib/osrm.ts`: consulta interna compartida, `OSRM_URL` y `duracionOSRM`.
  - Para compilar hizo falta `npm install`, porque faltaba `maplibre-gl` (Spec 18).
  - Al medir las coordenadas del caso de prueba contra OSRM, el C3 propuesto (frente al Monumento) caía en la mano contraria de Av. Belgrano y daba ~2 min en vez de menos de uno. Claude buscó un punto que diera ~17s y corrigió el spec, junto con el rango de C1 (~9 min).
- Paso 3: `ETA_MS` y `ETA_VIGENCIA_MS` en `lib/despacho.ts`, y `formatoEta` en `lib/formato.ts`, probada con varios valores.
- Paso 4: Server Action `etaConductor` en `app/actions/viaje.ts`.
- Paso 5: el ETA en P07. Cada ETA guarda el estado para el que se calculó. Así, al pasar a `en_curso`, no se muestra el ETA viejo, sin necesidad de resetearlo dentro del efecto.

> commitealo y pushealo

## 6. Prueba

> como abro las devtools

Claude explicó cómo simular la ubicación del conductor desde el panel Sensors de Chrome.

> ya hice hasta el paso 5, todo bien

Para el paso 6, Claude agregó `OSRM_URL` a `.env.local`. En el log del servidor vio que, al guardar ese archivo, Next recargó también las pestañas abiertas: el pasajero perdía el ETA guardado y el paso 6 no se podía verificar así. Propuso cortar OSRM editando temporalmente `lib/osrm.ts`, un archivo sólo del servidor que refresca los datos sin recargar la página.

> 1, siguió visible y después desapareció

Con ese método pasaron los pasos 6 y 7. Claude revirtió `lib/osrm.ts` y contó en el log las llamadas del paso 10: 4 llamadas a `etaConductor` y 24 polls en 2 minutos.

> el paso 9 también, muestra ubicando al conductor

Claude marcó el spec como `implementado` y cambió los pasos 6 a 8 al nuevo método de corte. También marcó los criterios verificados y agregó las notas de implementación. Quedaron anotados dos criterios que cubre el código pero no se recorrieron en la UI: sin ETA con el viaje finalizado o cancelado, y `null` para un viaje ajeno.

## 7. Cierre

> commitealo, pushealo y abrí el PR

> mergea el PR y borrá la rama

El PR #14 tenía el check de Vercel en rojo ("Deployment was blocked"), a diferencia de los PRs #11 a #13. Claude avisó antes de mergear, y se decidió mergear igual y revisar Vercel aparte. Merge a `develop` y rama borrada.

> documentá los prompts de la sesión del spec 27

Origen de este archivo.
