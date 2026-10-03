# Prompts — Spec 12: Contactos de confianza y alerta de emergencia

Prompts más relevantes de la sesión con Claude Code que llevó a este spec, en orden cronológico. El resto de la conversación (cambiar de rama, levantar el servidor, autenticar `gh`) no se incluye por no ser específico de este spec.

## 1. Arranque del spec

> vamos con el spec 12 seguridad del viaje

Claude buscó `specs/12-seguridad-del-viaje.md` en el repo, no lo encontró (el último era el Spec 11), y preguntó cómo se quería avanzar (redactarlo juntos, pegar el contenido ya definido, o si estaba en otro lado).

Respuesta elegida: **"Ya tenés el contenido"** → pegar el contenido y que Claude lo guarde con el formato correcto.

## 2. Consigna del spec (la más importante)

> Spec 12: Contactos de confianza y alerta de emergencia
> Cubre CUP-08, US-08/09 y las pantallas P07 y P10.
> [ ] Commit 1: specs/12-seguridad-del-viaje.md.
> [ ] Migración 0014_seguridad.sql: tabla contactos_confianza (nombre, teléfono; con RLS para que cada usuario vea solo los suyos) y tabla alertas_emergencia (viaje, usuario, ubicación, fecha).
> [ ] app/actions/seguridad.ts y la pantalla app/perfil/contactos/ para agregar y quitar contactos.
> [ ] En app/viajar/viaje-pendiente.tsx, solo la parte del viaje en curso (P07): "Emergencia" registra la alerta con la ubicación y además llama al 911; "Compartir viaje" sugiere los contactos de confianza.

A partir de este checklist, Claude:
- Leyó el spec 11 como referencia de formato y las migraciones/acciones/UI existentes (`app/perfil`, `app/actions`, `app/viajar/viaje-pendiente.tsx`, `lib/supabase/types.ts`) para mantener las mismas convenciones del proyecto.
- Redactó `specs/12-seguridad-del-viaje.md` completo (alcance, modelo de datos, plan de implementación, criterios de aceptación, decisiones, riesgos).
- Creó la rama `spec-12-seguridad-del-viaje` desde `develop` (según el default `AutoCreateBranch: true` de `specs/.spec-config.yml`).
- Implementó cada ítem del checklist en un commit separado: la migración `0014_seguridad.sql`, las Server Actions + pantalla `/perfil/contactos`, y los cambios en `viaje-pendiente.tsx`.

## 3. Identidad de git (bloqueante, no relacionado al diseño del spec)

> ! git config --global user.name "Jeronimo"
> ! git config --global user.email "46760781@terciariourquiza.edu.ar"

Necesario para poder commitear (git no tenía autor configurado en la máquina).

## 4. Verificación end-to-end

> listo ya hice lo de sql editor

> listo me dejo hacer todo

> sí, probé emergencia también

Con la migración aplicada a mano en el SQL Editor de Supabase, se probó en el navegador: agregar un contacto de confianza, que "Compartir viaje" lo sugiriera, y que "Emergencia" registrara la alerta (con o sin ubicación) además de llamar al 911. Claude confirmó cada paso revisando los logs del servidor de desarrollo (`app/actions/seguridad.ts` → `agregarContacto`, `getContactos`, `registrarAlerta`, todos sin error). Con eso confirmado, se hizo el commit final que marca el spec como `implementado`.
