// Copia el worker de MapLibre GL a public/maplibre/ (Spec 18).
//
// MapLibre crea sus Web Workers a partir de una URL que deduce de su propio
// import.meta.url. Con el bundler de Next esa URL deja de apuntar al archivo
// del worker, así que se sirve como estático y se le pasa la ruta por
// `workerUrl` (ver WORKER_MAPA en lib/mapa.ts). El worker importa
// ./maplibre-gl-shared.mjs, por eso se copian los dos juntos.
//
// Corre antes de `dev` y de `build` para que siempre coincidan con la versión
// instalada de maplibre-gl. La carpeta de destino está en .gitignore.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const origen = join(raiz, "node_modules", "maplibre-gl", "dist");
const destino = join(raiz, "public", "maplibre");

mkdirSync(destino, { recursive: true });
for (const archivo of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(origen, archivo), join(destino, archivo));
}
