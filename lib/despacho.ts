// Constantes del despacho de viajes (Spec 05).
//
// Los 20s (TTL de oferta) y 30s (ventana de presencia) son la fuente de verdad
// dentro de las funciones SQL del servidor; acá se replican sólo para la UI:
// la cuenta regresiva de la oferta y el intervalo de polling de ambas vistas.

export const OFERTA_TTL_S = 20; // vida de una oferta 1×1, en segundos
export const PRESENCIA_TTL_S = 30; // ventana de "conductor activo", en segundos
export const POLL_MS = 5000; // intervalo de polling (/conducir y /viajar)

// Spec 24: un viaje pendiente que nadie acepta se cancela solo después de
// este tiempo. El literal real vive en despachar_viaje() (Postgres); esta
// constante es sólo la referencia del lado del cliente.
export const DESPACHO_TIMEOUT_MIN = 10;

// La frescura de la ubicación del conductor (~30s) vive del lado servidor: la RPC
// datos_conductor devuelve un booleano ubic_vigente calculado con now(). No se
// replica acá para no comparar timestamps contra el reloj del cliente.
