# CLAUDE.md

Este archivo brinda orientación a Claude Code (claude.ai/code) al trabajar con el código de este repositorio.

@AGENTS.md

## Crítico: verificá las APIs de Next.js contra la documentación local

Este repo fija **Next.js 16.2.10** (ver `AGENTS.md`). No te apoyes en el conocimiento de Next.js de tus datos de entrenamiento — las APIs y convenciones de esta versión pueden diferir. Antes de escribir código de routing, obtención de datos, caché, metadata o configuración, leé la guía correspondiente dentro de `node_modules/next/dist/docs/`:

- `01-app/**` — documentación del App Router (este proyecto usa App Router; preferí estas).
- `02-pages/**` — documentación del Pages Router (no se usa acá; ignorar salvo migración).
- `01-app/03-api-reference/05-config/01-next-config-js/**` — un archivo por cada opción de `next.config.ts`.

## Comandos

```bash
npm run dev      # inicia el servidor de desarrollo en http://localhost:3000
npm run build    # build de producción
npm run start    # sirve el build de producción
npm run lint     # eslint (flat config, next core-web-vitals + typescript)
```

Todavía no hay runner de tests configurado — no existe script `test` ni archivos de test.

## Stack y arquitectura

- **Next.js 16 App Router + React 19.** Todas las rutas viven en `app/`. `app/layout.tsx` es el layout raíz (carga las fuentes Geist, define el esqueleto `<html>`/`<body>`); `app/page.tsx` es la ruta de inicio. Agregá rutas como `app/<segmento>/page.tsx`.
- **Tailwind CSS v4, configuración CSS-first.** **No hay `tailwind.config.js`**. Los tokens de tema y la configuración de diseño viven en `app/globals.css` mediante `@import "tailwindcss"` y el bloque `@theme inline { ... }`. Agregá colores/fuentes/tokens ahí, no en un config de JS.
- **Alias de rutas de TypeScript:** `@/*` apunta a la raíz del proyecto (por ej. `@/app/...`, `@/lib/...`).
- **Supabase (ya integrado).** `.env.local` contiene `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (nueva nomenclatura de publishable key, no la antigua `ANON_KEY`). Helpers en `lib/supabase/`:
  - `client.ts` — `createClient()` con `createBrowserClient`, para Client Components.
  - `server.ts` — `createClient()` async con `createServerClient`, para Server Components/Route Handlers/Server Actions. Se crea uno nuevo por request.
  - `proxy.ts` — `updateSession()`, invocado desde `proxy.ts` en la raíz del proyecto (el middleware); refresca la sesión en cada request y redirige a `/login` si no hay usuario y la ruta no es pública (`RUTAS_PUBLICAS`: `/login`, `/registro`).
  - `types.ts` — tipos generados/definidos del esquema.
  Las migraciones SQL viven en `supabase/migrations/` (perfiles, vehículos, viajes, despacho, ubicación, historial, calificaciones, remiserías, pagos, invitaciones, desglose de empresa). Al agregar auth o acceso a datos, seguí usando los helpers existentes en `lib/supabase/` en vez de instanciar `@supabase/ssr` directamente.

## Notas

- `.env*` está en `.gitignore`; nunca commitees secretos. Las variables de entorno con prefijo `NEXT_PUBLIC_` quedan expuestas al navegador.
