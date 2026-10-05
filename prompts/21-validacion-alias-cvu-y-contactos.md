# Prompts — Spec 21: Validación de alias/CVU y contactos

Prompts más relevantes de la sesión con Claude Code que llevó a este spec, en orden cronológico. El resto de la conversación (levantar y apagar el servidor, limpiar archivos de prueba) no se incluye por no ser específico de este spec.

## 1. Consigna del spec (la más importante)

> ahora te paso el spec 21

> Validación de alias/CVU y contactos. objetivo:Alias o CVU con formato real; teléfono de contactos con la regla de la 19.

Antes de preguntar, Claude revisó el código y encontró:
- `guardarAliasCvu` sólo hacía `trim` y un tope de 60 caracteres: aceptaba cualquier texto.
- El teléfono de los contactos **ya** usaba `validarTelefono` del Spec 19 en la app; faltaba el `CHECK` en `contactos_confianza`, que el Spec 19 había dejado fuera.

También explicó los formatos reales: CVU y CBU de 22 dígitos con dos dígitos verificadores, y alias de 6 a 20 caracteres.

## 2. Preguntas de diseño

Respuestas elegidas:
- Claves aceptadas: **CVU y CBU**.
- Dígitos verificadores: **sí, se verifican** (algoritmo del BCRA, sólo en la app).
- Alias: **se guarda en minúsculas**.
- Base: **`CHECK` de alias/CVU en `profiles`** y **`CHECK` de teléfono en `contactos_confianza`**.
- Datos viejos: **normalizar y abortar listando el resto**, como la 0020.
- Separadores en el CVU: **se quitan** espacios y guiones.
- Error en `/perfil/pagos`: **debajo del campo y al salir de él**, como los formularios del Spec 19.
- Mensajes: **uno por caso** (vacío, largo del CVU, verificador, alias).

Claude probó el algoritmo del verificador con un CBU y un CVU antes de escribirlo en el spec. Además, aprovechando lo que pasó con la 0020, hizo que la verificación de la migración también liste los perfiles cuyo alias hay que normalizar y que tienen un teléfono o nombre fuera de los `CHECK` del Spec 19.

## 3. Implementación

> /spec-impl 21-validacion-alias-cvu-y-contactos

> crea una rama nueva para el spec y luego implementalo

Claude creó la rama `spec-21-validacion-alias-cvu-y-contactos` e implementó `validarAliasCvu` en `lib/validacion.ts`, la migración `0021_validacion_alias_cvu_y_contactos.sql`, la acción `guardarAliasCvu` y el formulario de `/perfil/pagos`. Al probar el validador con un script descubrió que el ejemplo de CVU con espacios del spec tenía un dígito de menos, y corrigió el ejemplo en el spec.

## 4. Prueba

> ya aplique la migracion sin errores, podes correr el servidor y darme los casos de prueba

> Failed to run sql query: ERROR: 22P02: invalid input syntax for type uuid: "<id>"

El caso de prueba en SQL tenía `<id>` como marcador. Claude lo reescribió con una subconsulta para no tener que buscar el UUID. Después de eso, los `CHECK` rechazaron los valores inválidos como se esperaba.

## 5. Cierre

> todo pasó, marcalo implementado y hacé los commits

> lo que yo quiero es que mergees a develop y borres la rama que se creo para el spec

Spec marcado como `implementado`, commits, PR #12 con los checks de Vercel en verde, merge a `develop` y rama borrada.

> me olvide de pedirte que junto con el commit subas los promts mas importantes del spec ya que es una consigna del profesor

Origen de este archivo y del de `prompts/20-restricciones-vehiculo.md`.
