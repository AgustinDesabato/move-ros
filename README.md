# Move Ros

Aplicación de movilidad urbana para Rosario y alrededores: un pasajero pide un
viaje sobre un mapa, la plataforma se lo ofrece a los conductores disponibles,
el conductor lo acepta y lo recorre, y al terminar quedan registrados el pago,
el historial y las calificaciones. Las remiserías pueden agrupar conductores
bajo su cuenta y ver lo recaudado.

Proyecto académico, desarrollado con metodología **spec-driven**: cada
funcionalidad se especifica en `specs/` antes de escribirse, y cada spec se
implementa en su propia rama. Ver [Metodología](#metodología).

## Stack

| Capa | Tecnología |
| --- | --- |
| Framework | Next.js 16.2.10 (App Router) + React 19.2.4 |
| Lenguaje | TypeScript |
| Estilos | Tailwind CSS v4 (configuración CSS-first, sin `tailwind.config.js`) |
| Backend | Supabase (Postgres + Auth + RLS) vía `@supabase/ssr` |
| Mapas | Leaflet + react-leaflet sobre OpenStreetMap |
| Geocoding | Photon, acotado a la ciudad de Rosario |
| Ruteo | OSRM (`router.project-osrm.org`) |
| Hosting | Vercel |

No hay servidor propio: la lógica vive en Server Actions y Route Handlers de
Next.js, y las reglas de acceso a datos en las policies de RLS y las funciones
`security definer` de Postgres.

## Puesta en marcha

Requiere Node.js 20.9 o superior (probado en 24.x).

```bash
git clone https://github.com/AgustinDesabato/move-ros.git
cd move-ros
npm install
cp .env.example .env.local   # y completá los valores
npm run dev                  # http://localhost:3000
```

### Variables de entorno

Copiá `.env.example` a `.env.local` y completá:

| Variable | De dónde sale |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Settings → API → publishable key |

Es la *publishable key* (nomenclatura nueva), no la `anon` vieja ni la
`service_role`. Al llevar prefijo `NEXT_PUBLIC_` quedan expuestas al navegador:
es por diseño, la barrera real de datos es la RLS de Postgres.

En Vercel, las mismas dos variables van en Settings → Environment Variables.
**Se incrustan en tiempo de build**, así que después de cambiarlas hace falta un
redeploy: un deploy viejo no las toma.

### Base de datos

Las migraciones están en `supabase/migrations/`, numeradas y en orden de
dependencia. En un proyecto de Supabase nuevo, ejecutalas **una por una y en
orden** desde el SQL Editor, de `0001` a `0013`.

Configuración fuera del código, en el dashboard de Supabase:

- Auth → Sign In / Providers → Email → **"Confirm email" desactivado** (decisión
  de la SPEC 01 para el MVP; revisable antes de producción).

> **Aviso.** El plan free de Supabase **pausa el proyecto a los 7 días sin
> actividad**. Con el proyecto pausado, la app carga pero fallan el login y el
> registro. Se reactiva desde el dashboard con "Restore project".

## Comandos

```bash
npm run dev      # servidor de desarrollo en http://localhost:3000
npm run build    # build de producción
npm run start    # sirve el build de producción
npm run lint     # eslint (flat config: next core-web-vitals + typescript)
npm run stop     # frena el dev server y libera el puerto 3000
```

Todavía no hay runner de tests configurado.

## Estructura

```
app/
  actions/      Server Actions: auth, perfil, viaje, conductor, empresa, invitaciones
  api/          Route Handlers: geocode (Photon) y ruteo (OSRM)
  login/        Ingreso
  registro/     Alta de cuenta con elección de rol
  perfil/       Perfil, vehículo del conductor, invitaciones recibidas
  viajar/       Vista del pasajero: mapa, tarifa, solicitud, seguimiento
  conducir/     Vista del conductor: ofertas, viaje en curso, ubicación
  viajes/       Historial y calificaciones
  empresa/      Panel de la remisería
lib/
  supabase/     Clientes (navegador, servidor, proxy) y tipos
  tarifa.ts     Cálculo de tarifa
  despacho.ts   Reglas de asignación de viajes
  geocode.ts    Direcciones y coordenadas
  osrm.ts       Ruta por calles
  pagos.ts      Comisión y neto
proxy.ts        Refresco de sesión y protección de rutas (ex middleware)
supabase/
  migrations/   SQL numerado, una migración por spec
specs/          Una especificación por funcionalidad
```

### Roles

Un usuario tiene un rol único, elegido al registrarse, que determina a dónde
cae después del login:

| Rol | Ruta | Qué hace |
| --- | --- | --- |
| `pasajero` | `/viajar` | Pide viajes, sigue al conductor, califica, paga |
| `conductor` | `/conducir` | Recibe ofertas, recorre el viaje, cobra |
| `empresa` | `/empresa` | Remisería: invita conductores y ve lo recaudado |

## Metodología

El desarrollo sigue un flujo spec-driven:

1. La funcionalidad se especifica en `specs/NN-nombre.md`: alcance, modelo de
   datos, plan de implementación, criterios de aceptación, decisiones y riesgos.
2. Se implementa en una rama `spec-NN-slug` (`specs/.spec-config.yml` la crea
   automáticamente).
3. Se mergea a `master` por Pull Request.

Convención de commits: `Spec NN: <título>` para funcionalidad nueva, `Fix: <qué>`
para correcciones, `chore: <qué>` para herramientas e infraestructura.

Las correcciones posteriores a una spec ya implementada se anotan en una sección
"Correcciones posteriores" dentro de esa spec, para que el documento no quede
desactualizado respecto del código.

### Specs

| # | Spec | Estado |
| --- | --- | --- |
| 01 | Autenticación y roles con Supabase | Implementado |
| 02 | Perfil de usuario y datos del vehículo | Implementado |
| 03 | Mapa y selección de origen/destino | Implementado |
| 04 | Solicitud de viaje y estimación de tarifa | Implementado |
| 05 | Despacho de viajes a conductores | Implementado |
| 06 | Seguimiento de ubicación en vivo del conductor | Implementado |
| 07 | Historial de viajes | Implementado |
| 08 | Calificaciones de conductor y pasajero | Implementado |
| 09 | Capa de propiedad de remiserías | Implementado |
| 10 | Pagos del viaje (registro y comisión) | Aprobado |
| 11 | Consentimiento del conductor (invitación) | Implementado |

## Alcance del MVP

Lo que **no** está incluido, y queda para etapas posteriores:

- Pasarela de pagos real: el pago digital está simulado (SPEC 10).
- Recuperación y cambio de contraseña.
- Login con proveedores externos (Google, teléfono, magic link).
- Verificación de identidad o documentación del conductor.
- Notificaciones push o por email.
- Tests automatizados.

## Despliegue

Desplegado en Vercel: <https://move-ros.vercel.app>

Cada push a `master` dispara un deploy. Las variables de entorno se configuran
en el proyecto de Vercel, no en el repo.
