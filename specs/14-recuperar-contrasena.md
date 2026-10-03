# SPEC 14 — Recuperación de contraseña

> **Estado:** implementado
> **Depende de:** SPEC 01
> **Fecha:** 2026-09-30
> **Objetivo:** Cubrir CUG-03 y el enlace de P02: quien olvidó su contraseña recupera el acceso sin ayuda — la pide desde el login, recibe un mail, sigue el link y elige una contraseña nueva.

Spec 01 dejó esto explícitamente fuera de alcance ("Recuperación / cambio de contraseña"). Este spec lo cierra usando **Supabase Auth** tal cual está (no se agrega ninguna tabla propia): `supabase.auth.resetPasswordForEmail()` para pedir el link y `supabase.auth.verifyOtp()` + `supabase.auth.updateUser()` para consumirlo y fijar la contraseña nueva.

## Alcance

**Incluye:**

- **Configuración en Supabase (fuera del código):** editar la plantilla de mail "Reset Password" (Auth → Templates) para que el link use `token_hash` en vez de `ConfirmationURL` —el patrón que recomienda Supabase para apps con `@supabase/ssr`, porque así el link se puede verificar del lado del servidor sin depender del fragmento de la URL (`#access_token=...`)—:
  ```
  <a href="{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=recovery&next=/restablecer">Restablecer contraseña</a>
  ```
- **Server Actions nuevas** en `app/actions/auth.ts`:
  - `pedirRecuperacion(prevState, formData)`: valida el email y llama a `resetPasswordForEmail`. Nunca revela si el email existe (Supabase tampoco lo hace): siempre devuelve el mismo `aviso` de éxito, salvo fallo de servicio o límite de envíos.
  - `cambiarContrasena(prevState, formData)`: exige una sesión activa (la que dejó `verifyOtp` al seguir el link), valida la contraseña nueva (≥ 8 caracteres, mismo criterio que el registro) y llama a `updateUser({ password })`. Al éxito, redirige según el rol del usuario (mismo `RUTA_POR_ROL` que usan `registrarse`/`iniciarSesion`).
- **Ruta que recibe el link del mail:** `app/auth/confirmar/route.ts` (Route Handler). Lee `token_hash`, `type` y `next` de la query, llama a `supabase.auth.verifyOtp({ type, token_hash })` —que deja la sesión de recuperación en las cookies— y redirige a `next` (`/restablecer`); si falla (link vencido o ya usado), redirige a `/recuperar?error=link_invalido`.
- **Pantalla `/recuperar`** (`app/recuperar/page.tsx` + `recuperar-form.tsx`, nuevas): pide el email y llama a `pedirRecuperacion`. Si llega con `?error=link_invalido` (rebote desde `/auth/confirmar`), muestra ese aviso arriba del formulario.
- **Pantalla `/restablecer`** (`app/restablecer/page.tsx` + `restablecer-form.tsx`, nuevas): si hay sesión (llegó por el link válido), muestra el formulario de contraseña nueva; si no, muestra "este link venció o no es válido" con un enlace de vuelta a `/recuperar`.
- **`lib/supabase/proxy.ts`:** `/recuperar`, `/restablecer` y `/auth/confirmar` se suman a `RUTAS_PUBLICAS` — nadie que llega a estas rutas tiene todavía (o nunca va a tener) una sesión completa al primer request, así que no pueden quedar detrás del gate de autenticación.
- **`app/login/page.tsx`:** enlace "¿Olvidaste tu contraseña?" debajo del campo de contraseña, a `/recuperar`.

**Fuera de alcance (para specs futuros):**

- Cambiar la contraseña estando ya logueado (desde `/perfil`, sabiendo la actual). Este spec sólo cubre el olvido (sin sesión).
- Invalidar sesiones activas en otros dispositivos al cambiar la contraseña.
- Notificar por mail que la contraseña cambió.
- Un límite propio de reintentos en el front (Supabase ya aplica su propio rate-limit de envíos; el spec sólo traduce ese error).
- Requisitos de complejidad de contraseña más allá de la longitud mínima (igual que el registro).

## Modelo de datos

Ninguno nuevo. Esta spec no agrega tablas ni RLS: usa `auth.users` de Supabase Auth (fuera del schema `public`) a través de sus propios métodos (`resetPasswordForEmail`, `verifyOtp`, `updateUser`). No hay migración SQL.

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Spec.** Este documento (`specs/14-recuperar-contrasena.md`). *Verificación:* revisión del alcance.
2. **Configurar Supabase (fuera del código).** En el dashboard: Auth → Templates → "Reset Password", reemplazar el link por el que usa `token_hash` (ver Alcance). Confirmar que Auth → URL Configuration tiene el `Site URL` correcto (`http://localhost:3000` en dev). Sin cambios de código todavía.
3. **Server Actions.** `pedirRecuperacion` y `cambiarContrasena` en `app/actions/auth.ts`. *Verificación:* `npm run build` compila.
4. **Ruta del link + pantallas.** `app/auth/confirmar/route.ts`; `app/recuperar/page.tsx` + `recuperar-form.tsx`; `app/restablecer/page.tsx` + `restablecer-form.tsx`. *Verificación:* `npm run lint` pasa.
5. **Rutas públicas + enlace en login.** `lib/supabase/proxy.ts` (+`/recuperar`, `/restablecer`, `/auth/confirmar`); `app/login/page.tsx` (+enlace "¿Olvidaste tu contraseña?"). *Verificación:* sin sesión, `/recuperar` y `/restablecer` cargan (no rebotan a `/bienvenida`).
6. **Prueba end-to-end.** Desde `/login`, tocar "¿Olvidaste tu contraseña?" → `/recuperar`, pedir el link con un email real de prueba → aviso de éxito. Abrir el mail, seguir el link → cae en `/restablecer` con el formulario visible. Cargar una contraseña nueva de al menos 8 caracteres → redirige a la pantalla del rol. Cerrar sesión e iniciar sesión con la contraseña nueva → funciona. Visitar `/restablecer` directo sin haber seguido ningún link → muestra "link inválido" en vez del formulario. *Verificación:* todos los criterios de aceptación.

## Criterios de aceptación

- [ ] En `/login` hay un enlace "¿Olvidaste tu contraseña?" que lleva a `/recuperar`.
- [ ] `/recuperar` pide un email; al enviarlo (exista o no esa cuenta) muestra el mismo aviso de éxito y no revela si el email está registrado.
- [ ] Un email inválido en `/recuperar` muestra un error y no llama a Supabase.
- [ ] El mail de recuperación llega con un link a `/auth/confirmar?token_hash=...&type=recovery&next=/restablecer`.
- [ ] Seguir ese link válido redirige a `/restablecer` con el formulario de contraseña nueva visible (hay sesión).
- [ ] Un link vencido o ya usado redirige a `/recuperar` con un aviso de error, no rompe con un error sin manejar.
- [ ] En `/restablecer`, una contraseña de menos de 8 caracteres muestra error y no cambia nada.
- [ ] En `/restablecer`, una contraseña válida cambia la contraseña y redirige a la pantalla del rol del usuario (`/viajar`, `/conducir` o `/empresa`).
- [ ] Después de cambiarla, cerrar sesión e iniciar sesión con la contraseña nueva funciona; la vieja ya no sirve.
- [ ] Visitar `/restablecer` sin sesión (sin haber seguido el link) muestra "este link venció o no es válido" en vez del formulario.
- [ ] `/recuperar`, `/restablecer` y `/auth/confirmar` son accesibles sin sesión (no rebotan a `/bienvenida`).
- [ ] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** flujo de `token_hash` + Route Handler propio (`verifyOtp` del lado del servidor). **No:** el flujo por defecto de `ConfirmationURL` con tokens en el fragmento de la URL (`#access_token=...`), que exigiría parsearlo con JS en el cliente y llamar a `setSession` desde el navegador. El patrón de `token_hash` es el que recomienda Supabase para apps con `@supabase/ssr` como esta: la sesión queda escrita en cookies del lado del servidor, sin depender de que el navegador ejecute JS para leer el fragmento.
- **Sí:** `pedirRecuperacion` siempre devuelve el mismo aviso de éxito (salvo fallo de servicio o rate-limit). **No:** distinguir "ese email no existe". Revelar la existencia de una cuenta por email es una filtración de datos clásica (enumeración de usuarios); Supabase ya se comporta así por diseño y el front no debe deshacer esa protección.
- **Sí:** `/restablecer` es pública en `proxy.ts` y hace su propio chequeo de sesión para decidir qué mostrar (formulario o "link inválido"). **No:** dejarla protegida y confiar en que siempre llegue con sesión ya puesta por el redirect de `/auth/confirmar`. Alguien puede visitarla directo, con el link vencido, o después de que la sesión de recuperación expiró; la pantalla necesita poder mostrar ese caso en vez de que el usuario reciba un rebote silencioso a `/bienvenida`.
- **Sí:** al cambiar la contraseña, redirigir directo a la pantalla del rol (como `iniciarSesion`). **No:** cerrar la sesión y mandar a `/login` a que la escriba de nuevo. `updateUser` sobre la sesión de recuperación ya deja una sesión completa y válida; pedirle al usuario que vuelva a loguearse es un paso extra sin beneficio de seguridad real acá.
- **Sí:** contraseña nueva con un solo campo (sin "repetir contraseña"). **No:** doble campo de confirmación. El registro (Spec 01) tampoco lo pide; agregarlo acá sería inconsistente y no lo pidió el checklist.
- **No:** cambio de contraseña estando logueado (con la actual como confirmación). Es un caso distinto (no es "la olvidé") que merece su propio flujo si se pide.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| **La plantilla de mail no se actualiza en el dashboard** y sigue usando `ConfirmationURL`: el link cae en `/restablecer` con el token en el fragmento, no en `token_hash`, y `verifyOtp` nunca se llama. | Paso explícito en el plan de implementación (paso 2, fuera del código) y primer criterio de aceptación de la prueba end-to-end; sin ese cambio, la prueba manual lo detecta de inmediato porque `/auth/confirmar` nunca recibe `token_hash`. |
| **Enumeración de usuarios** si en algún punto se filtra si el email existe. | `pedirRecuperacion` nunca ramifica sobre "no existe"; Supabase tampoco lo hace en `resetPasswordForEmail`. |
| **Link reusado o compartido:** un token de recuperación usado dos veces. | Lo maneja Supabase: un `token_hash` de recovery es de un solo uso y expira; un segundo uso cae en la rama de error de `verifyOtp` y `/auth/confirmar` redirige a `/recuperar` con el aviso. |
| **`Site URL` mal configurado** en el dashboard (por ejemplo apuntando a producción mientras se prueba en local). | Es una configuración global del proyecto de Supabase, no de este spec; se verifica a mano en el paso 2 antes de probar. |

## Lo que **no** entra en este spec

- Cambio de contraseña estando logueado.
- Cierre de otras sesiones activas al recuperar.
- Notificación de que la contraseña cambió.
- Requisitos de complejidad de contraseña.
