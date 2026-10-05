# Prompts — Spec 20: Restricciones del vehículo en la base

Prompts más relevantes de la sesión con Claude Code que llevó a este spec, en orden cronológico. El resto de la conversación (levantar y apagar el servidor, actualizar `develop`) no se incluye por no ser específico de este spec.

## 1. Arranque del spec

> necesito que veas el spec 19 y ahora te paso de que trata el spec 20 porque tiene un poco de contenido dentro

Claude leyó `specs/19-validacion-datos-personales.md` y lo resumió: `lib/validacion.ts` como única fuente de las reglas, errores por campo, migración 0019 con `CHECK ... NOT VALID`, y lo que quedó fuera de alcance (entre otras cosas, la unicidad de patente).

## 2. Consigna del spec (la más importante)

> Formato de patente argentina, patente única, color de una lista, rango de capacidad; check en vehiculos. de esto trataria el spec 20

Antes de preguntar, Claude revisó el código y las migraciones y marcó la superposición con el Spec 19:
- El formato de patente ya estaba en `validarPatente` y en `vehicles_patente_formato` (`NOT VALID`).
- El color ya salía de una lista en la app, pero el Spec 19 había decidido **no** ponerle `CHECK`.
- La capacidad 1–10 ya estaba en la app y con un `CHECK` desde la 0002.
- Lo realmente nuevo era la **patente única**.

## 3. Preguntas de diseño

> prefiero que las preguntas me las hagas como antes, lo anterior solo era una duda

Claude siguió el flujo de la skill `/spec` y preguntó con opciones (herramienta de preguntas de Claude Code). Respuestas elegidas:
- Color en la base: **`CHECK` con la lista literal**. Revierte la decisión del Spec 19.
- Marca: **sin `CHECK`**, sólo el color.
- Patentes duplicadas existentes: **la migración aborta listándolas**.
- `CHECK` del Spec 19: **`VALIDATE CONSTRAINT`** sobre todas las filas.
- Patente repetida: **capturar el error `23505`** del `upsert` (la RLS no deja ver vehículos ajenos y una RPC permitiría enumerar patentes).
- Orden de guardado: **vehículo antes que perfil**, para no dejar el perfil guardado a medias.
- Capacidad: **1–6**; las filas con 7–10 hacen abortar la migración.
- Mensaje: **"Esa patente ya está registrada en otra cuenta."**

Con eso, Claude redactó `specs/20-restricciones-vehiculo.md` en estado borrador.

## 4. Implementación

> /spec-impl 20-restricciones-vehiculo

> cambialo a aprobado

> 2, seguí igual

> implementa todo sin preguntar

`/spec-impl` se negó a arrancar con el spec en borrador. Una vez aprobado, Claude creó la rama `spec-20-restricciones-vehiculo` e implementó la migración `0020_restricciones_vehiculo.sql`, `CAPACIDAD_MAX = 6` en `lib/validacion.ts` y en el formulario, y el cambio de orden y el manejo del `23505` en `guardarPerfil`.

## 5. Problemas al aplicar la migración

> Failed to run sql query: ERROR: 23514: new row for relation "vehicles" violates check constraint "vehicles_patente_formato"

La migración normalizaba el color **antes** de verificar los datos. Al actualizar una fila con patente inválida, Postgres aplicó el `CHECK NOT VALID` del Spec 19 y cortó sin mostrar la lista de problemas. Claude invirtió el orden (verificar primero, normalizar después) y actualizó el spec con la decisión.

> Failed to run sql query: ERROR: P0001: SPEC 20: corregí estos vehículos y volvé a correr la migración: [...]

La verificación listó 10 vehículos inválidos: una patente duplicada, patentes mal formadas, una capacidad de 7 y textos fuera de largo.

> no me podes acomodar la migracion completa en visual studio y despues pego y corro todo?

Claude armó un archivo de una sola vez, fuera del repo, con las correcciones de esas filas más la migración completa.

> perfecto funciono

## 6. Prueba y cierre

> corre el servidor y pasame los casos de prueba

> todo pasó, marcalo implementado y hacé los commits

> sí, subí la rama y abrí el PR

> mergeá el PR a develop

Se probaron en el navegador la patente repetida, el perfil sin guardado parcial y la capacidad 1–6, y en el SQL Editor los tres `CHECK` nuevos. Después: spec marcado como `implementado`, commits, PR #11 y merge a `develop`.
