# SPEC 32 — Configuración de la cuenta

> **Estado:** aprobado
> **Depende de:** SPEC 01, SPEC 14
> **Fecha:** 2026-10-29
> **Objetivo:** Que la opción "Configuración" de `/perfil` abra `/perfil/configuracion`, donde cualquier usuario logueado puede cambiar su contraseña dando la actual y cerrar la sesión en todos sus dispositivos.

Hoy "Configuración" aparece en el menú de `/perfil` como "Próximamente", sin enlace. El Spec 14 cubrió sólo el olvido de la contraseña (sin sesión) y dejó explícitamente fuera dos cosas: "cambiar la contraseña estando ya logueado" e "invalidar sesiones activas en otros dispositivos". Este spec cierra las dos.

Todo se resuelve con los métodos de **Supabase Auth** (`signInWithPassword`, `updateUser`, `signOut`). No hay migración SQL ni configuración nueva en el dashboard.

## Alcance

**Incluye:**

- **Menú de `/perfil`** (`app/perfil/page.tsx`): la opción "Configuración" pasa a tener `href="/perfil/configuracion"` y deja de mostrar "Próximamente". La ven los cuatro roles.
- **Pantalla `/perfil/configuracion`** (`app/perfil/configuracion/page.tsx`, nueva, Server Component): `BarraSuperior` "Configuración" que vuelve a `/perfil`, y una lista con dos filas:
  - "Cambiar contraseña" → enlace a `/perfil/configuracion/contrasena`.
  - "Cerrar sesión en todos los dispositivos" → el componente `CerrarSesiones` (ver abajo).
  - Si llega con `?aviso=contrasena`, muestra arriba de la lista el aviso "Cambiaste tu contraseña. Cerramos tu sesión en los otros dispositivos."
- **Componente** `app/perfil/configuracion/cerrar-sesiones.tsx` (nuevo, Client Component): la fila de cierre global con confirmación en línea, sin `window.confirm` (mismo patrón que la tarjeta "Tu remisería" del Spec 30).
- **Pantalla `/perfil/configuracion/contrasena`** (`app/perfil/configuracion/contrasena/page.tsx` + `contrasena-form.tsx`, nuevas): formulario con "Contraseña actual" y "Contraseña nueva", cada una con el botón de mostrar/ocultar de `/restablecer`.
- **Server Actions nuevas** en `app/actions/auth.ts`:
  - `actualizarContrasena(prevState, formData)`: verifica la actual, cambia la contraseña, cierra las otras sesiones y redirige a `/perfil/configuracion?aviso=contrasena`.
  - `cerrarSesionGlobal()`: cierra todas las sesiones del usuario, incluida la actual, y redirige a `/bienvenida`.
- **`CampoAuth`** (`app/actions/auth.ts`) suma `"actual"` para poder mostrar el error debajo del campo "Contraseña actual".

**Fuera de alcance (para specs futuros):**

- Cambiar el email de la cuenta.
- Eliminar la cuenta.
- Notificar por mail que la contraseña cambió.
- Listar las sesiones abiertas o cerrar una sola.
- Requisitos de complejidad más allá de la longitud mínima (igual que el registro y el Spec 14).
- Cualquier otra preferencia en `/perfil/configuracion` (idioma, notificaciones, tema).

## Modelo de datos

Este spec no agrega tablas, columnas ni RLS. Usa `auth.users` y las sesiones de Supabase Auth a través de sus propios métodos. No hay migración SQL.

### Server Actions (`app/actions/auth.ts`, extendido)

```ts
export type CampoAuth =
  | "nombre" | "apellido" | "email" | "telefono" | "password" | "actual";

// Cambia la contraseña de un usuario logueado. Verifica la actual con
// signInWithPassword, cambia con updateUser y cierra las otras sesiones.
export async function actualizarContrasena(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState>

// Cierra la sesión en todos los dispositivos, incluido este.
export async function cerrarSesionGlobal(): Promise<AuthState>
```

`actualizarContrasena`, en este orden:

1. `getUser()`. Sin usuario → `redirect("/login")`.
2. Valida los campos `actual` y `password` del form, juntando todos los errores antes de cortar:
   - `actual` vacío → `errores.actual = "Ingresá tu contraseña actual."`.
   - `password` con menos de 8 caracteres → `errores.password = ERROR_PASSWORD`.
   - `password` igual a `actual` → `errores.password = "La contraseña nueva tiene que ser distinta de la actual."`.
3. `signInWithPassword({ email: user.email, password: actual })`.
   - Falla de servicio → `{ error: ERROR_SERVICIO }`.
   - `over_request_rate_limit` → `{ error: "Demasiados intentos. Esperá unos minutos e intentá de nuevo." }`.
   - Cualquier otro error → `{ errores: { actual: "La contraseña actual no es correcta." } }`.
4. `updateUser({ password })`.
   - Falla de servicio → `{ error: ERROR_SERVICIO }`.
   - `same_password` → mismo error de campo que el paso 2.
   - Cualquier otro error → `{ error: "No se pudo cambiar la contraseña. Intentá de nuevo." }`.
5. `signOut({ scope: "others" })`. Si falla, se registra con `registrarFallo` y se sigue: la contraseña ya cambió.
6. `redirect("/perfil/configuracion?aviso=contrasena")`.

El paso 3 abre una sesión nueva y la escribe en las cookies. El paso 5 cierra todas las demás, incluida la sesión con la que el usuario había llegado a este dispositivo. Por eso el usuario sigue logueado acá con la sesión nueva.

Nunca se devuelven las contraseñas en `valores`, igual que en el resto de `auth.ts`.

`cerrarSesionGlobal`:

1. `signOut({ scope: "global" })`.
2. Si falla por servicio → `{ error: ERROR_SERVICIO }` y el usuario sigue logueado.
3. Si sale bien → `redirect("/bienvenida")`, igual que `cerrarSesion`.

### UI

**`/perfil/configuracion`:** misma lista blanca redondeada que el menú de `/perfil` (filas de `min-h-15` con ícono en un cuadrado `bg-crema`). La fila de contraseña lleva `IconoChevron`. Si hace falta un ícono nuevo, se agrega en `components/iconos.tsx`.

**`CerrarSesiones`** tiene dos estados:

| Estado | Contenido |
| --- | --- |
| Normal | Fila "Cerrar sesión en todos los dispositivos" con el texto en color `peligro`. |
| Confirmando | "¿Cerrar sesión en todos tus dispositivos? Vas a tener que volver a ingresar en cada uno." con "Cancelar" (vuelve al estado normal) y "Cerrar sesión" (llama a `cerrarSesionGlobal`). Los dos se deshabilitan mientras la action corre. |

Si la action devuelve error, se muestra con `MensajeError` debajo y la fila vuelve al estado normal.

**`ContrasenaForm`:** `useActionState` con `actualizarContrasena`. Usa los campos `actual` (`autoComplete="current-password"`) y `password` (`autoComplete="new-password"`, placeholder "Mínimo 8 caracteres"). Muestra los errores de campo con `ErrorCampo` y el error general con `MensajeError`. El botón dice "Guardar contraseña" y pasa a "Guardando…" mientras la action corre.

## Plan de implementación

Cada paso deja la app compilando y ejecutable con `npm run dev`.

1. **Commit 1 — este spec.** `specs/32-configuracion-de-la-cuenta.md`.
2. **Server Actions.** `actualizarContrasena`, `cerrarSesionGlobal` y `"actual"` en `CampoAuth`, en `app/actions/auth.ts`. *Verificación:* `npm run build` compila.
3. **Pantalla de configuración y cierre global.** `app/perfil/configuracion/page.tsx` y `cerrar-sesiones.tsx`. Enlace desde "Configuración" en `app/perfil/page.tsx`. *Verificación:* filas 1, 2 y 9 a 11 del caso de prueba.
4. **Cambio de contraseña.** `app/perfil/configuracion/contrasena/page.tsx` y `contrasena-form.tsx`. *Verificación:* filas 3 a 8 del caso de prueba; `npm run lint` y `npm run build` pasan.
5. **Prueba end-to-end.** Ver "Caso de prueba". *Verificación:* todos los criterios de aceptación.

## Caso de prueba

Precondición: `npm run dev` corriendo en `http://localhost:3000`. Un usuario U con contraseña `clave-vieja-1`, logueado en dos navegadores distintos (A y B, por ejemplo uno normal y uno en modo incógnito).

| # | Paso | Resultado esperado |
| --- | --- | --- |
| 1 | En A, abrir `/perfil`. | "Configuración" tiene chevron, no dice "Próximamente", y lleva a `/perfil/configuracion`. |
| 2 | En `/perfil/configuracion`, revisar la pantalla. | Muestra "Cambiar contraseña" y "Cerrar sesión en todos los dispositivos". La flecha de volver lleva a `/perfil`. |
| 3 | Tocar "Cambiar contraseña" y enviar con la actual vacía y la nueva `corta`. | Errores debajo de los dos campos. No se llama a Supabase. |
| 4 | Enviar con actual `equivocada` y nueva `clave-nueva-2`. | "La contraseña actual no es correcta." debajo de "Contraseña actual". A sigue logueado. |
| 5 | Enviar con actual `clave-vieja-1` y nueva `clave-vieja-1`. | "La contraseña nueva tiene que ser distinta de la actual." |
| 6 | Enviar con actual `clave-vieja-1` y nueva `clave-nueva-2`. | Redirige a `/perfil/configuracion` con el aviso "Cambiaste tu contraseña. …". A sigue logueado. |
| 7 | En B, recargar cualquier pantalla protegida. | B termina en `/bienvenida`. |
| 8 | En B, iniciar sesión con `clave-vieja-1` y después con `clave-nueva-2`. | La vieja falla con "Email o contraseña incorrectos."; la nueva entra. |
| 9 | En A, tocar "Cerrar sesión en todos los dispositivos" y después "Cancelar". | Aparece la confirmación en la misma fila; "Cancelar" la cierra sin cambiar nada. |
| 10 | En A, tocar "Cerrar sesión en todos los dispositivos" y después "Cerrar sesión". | A termina en `/bienvenida`. |
| 11 | En B, recargar cualquier pantalla protegida. | B termina en `/bienvenida`. |

## Criterios de aceptación

- [ ] En `/perfil`, "Configuración" lleva a `/perfil/configuracion` para los cuatro roles y ya no dice "Próximamente".
- [ ] `/perfil/configuracion` muestra "Cambiar contraseña" y "Cerrar sesión en todos los dispositivos", y vuelve a `/perfil`.
- [ ] Con la contraseña actual incorrecta, el cambio se rechaza con "La contraseña actual no es correcta." y el usuario sigue logueado.
- [ ] Una contraseña nueva de menos de 8 caracteres, o igual a la actual, se rechaza con un error debajo del campo y no cambia nada.
- [ ] Con datos válidos, la contraseña cambia, el usuario vuelve a `/perfil/configuracion` con el aviso de éxito y sigue logueado en ese dispositivo.
- [ ] Después del cambio, las sesiones de los otros dispositivos se cierran: al recargar terminan en `/bienvenida`.
- [ ] Después del cambio, la contraseña vieja ya no sirve para iniciar sesión y la nueva sí.
- [ ] "Cerrar sesión en todos los dispositivos" pide confirmación en la misma fila, sin diálogos del navegador; "Cancelar" no cambia nada.
- [ ] Al confirmar, este dispositivo termina en `/bienvenida` y los demás también al recargar.
- [ ] Ninguna Server Action devuelve una contraseña al navegador.
- [ ] `npm run build` compila sin errores y `npm run lint` pasa sin warnings.

## Decisiones

- **Sí:** verificar la actual con `signInWithPassword` usando el email del usuario. **No:** `updateUser({ current_password })`. Decisión del usuario: `current_password` sólo funciona si se activa "Require current password" en el dashboard. Eso sería un paso manual fuera del código, como la plantilla del Spec 14, y si alguien lo olvida la verificación no se hace.
- **Sí:** al cambiar la contraseña se cierran las otras sesiones (`scope: "others"`). **No:** dejarlas abiertas. Decisión del usuario: si alguien conocía la contraseña vieja y tenía una sesión abierta, cambiarla no serviría de nada.
- **Sí:** "Cerrar sesión en todos los dispositivos" incluye el actual (`scope: "global"`) y redirige a `/bienvenida`. **No:** `scope: "others"`. Decisión del usuario: es lo que dice el texto, y se comporta como "Cerrar sesión".
- **Sí:** subruta `/perfil/configuracion/contrasena` para el formulario. **No:** formulario y cierre global en una sola pantalla. Decisión del usuario: `/perfil/configuracion` queda como un menú, igual que `/perfil`, y es fácil sumarle opciones.
- **Sí:** dos campos, "Contraseña actual" y "Contraseña nueva". **No:** un tercer campo "repetir contraseña". Decisión del usuario: el registro y `/restablecer` (Spec 14) tampoco lo piden, y el botón de mostrar contraseña cubre el error de tipeo.
- **Sí:** al terminar, volver a `/perfil/configuracion` con un aviso por query (`?aviso=contrasena`). **No:** quedarse en el formulario. Decisión del usuario: el usuario ve el resultado en la pantalla de la que salió.
- **Sí:** confirmación en línea para el cierre global. **No:** un solo toque ni `window.confirm`. Decisión del usuario: obliga a volver a ingresar en todos lados, y los diálogos del navegador no siguen el estilo de la app (mismo criterio que el Spec 30).
- **Sí:** las acciones nuevas viven en `app/actions/auth.ts`. **No:** un archivo nuevo. Reusan `ERROR_PASSWORD`, `ERROR_SERVICIO`, `esFalloDeServicio` y `registrarFallo`.
- **Sí:** nombre `actualizarContrasena`. **No:** reusar `cambiarContrasena`. Esa es la del Spec 14: no pide la actual y redirige a la pantalla del rol.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Si `signInWithPassword` falla porque la actual es incorrecta, podría borrar la sesión actual de las cookies y dejar al usuario deslogueado. | Fila 4 del caso de prueba verifica que A sigue logueado. Si no sigue logueado, se verifica la actual con un cliente sin cookies (`persistSession: false`) en vez del de `lib/supabase/server.ts`. |
| Los otros dispositivos siguen entrando hasta que vence su access token, si el servidor de Auth no rechaza los tokens de sesiones cerradas. | `lib/supabase/proxy.ts` usa `getUser()`, que consulta el servidor de Auth en cada request en lugar de validar el JWT localmente. Filas 7 y 11 del caso de prueba lo verifican. |
| `signOut({ scope: "others" })` falla después de cambiar la contraseña, y el aviso dice que se cerraron las otras sesiones cuando no se cerraron. | El fallo se registra en los logs. El usuario puede usar "Cerrar sesión en todos los dispositivos" a mano. Es un caso de caída del servicio entre dos llamadas seguidas. |
| Probar contraseñas actuales a ciegas desde una sesión robada. | Supabase aplica su rate-limit a `signInWithPassword`; la action traduce `over_request_rate_limit` a un mensaje legible. |
| Un usuario sin email (por ejemplo, cuenta sólo por teléfono) no puede verificar la actual. | No existe en esta app: el registro (Spec 01) siempre pide email. |

## Lo que **no** entra en este spec

- Cambiar el email.
- Eliminar la cuenta.
- Mail de aviso por cambio de contraseña.
- Lista de sesiones abiertas o cierre de una sola.
- Requisitos de complejidad de contraseña.
- Otras preferencias en Configuración.

Cada uno de esos, si aterriza, va en su propio spec.
