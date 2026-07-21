// Constantes del despacho de viajes (Spec 05).
//
// Los 20s (TTL de oferta) y 30s (ventana de presencia) son la fuente de verdad
// dentro de las funciones SQL del servidor; acá se replican sólo para la UI:
// la cuenta regresiva de la oferta y el intervalo de polling de ambas vistas.

export const OFERTA_TTL_S = 20; // vida de una oferta 1×1, en segundos
export const PRESENCIA_TTL_S = 30; // ventana de "conductor activo", en segundos
export const POLL_MS = 5000; // intervalo de polling (/conducir y /viajar)
