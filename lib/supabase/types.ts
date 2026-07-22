export type UserRole = "pasajero" | "conductor";

export type Profile = {
  id: string;
  role: UserRole;
  nombre: string | null;
  telefono: string | null;
  last_seen_at: string | null;
  ubic_lat: number | null;
  ubic_lng: number | null;
  ubic_at: string | null;
  created_at: string;
};

export type Vehicle = {
  conductor_id: string;
  marca: string;
  modelo: string;
  patente: string;
  color: string;
  capacidad: number;
  updated_at: string;
};

export type TripStatus =
  | "pendiente"
  | "aceptada"
  | "en_curso"
  | "finalizada"
  | "cancelada";

export type Trip = {
  id: string;
  pasajero_id: string;
  conductor_id: string | null;
  origen_lat: number;
  origen_lng: number;
  origen_label: string;
  destino_lat: number;
  destino_lng: number;
  destino_label: string;
  distancia_m: number;
  duracion_s: number;
  tarifa_estimada: number;
  estado: TripStatus;
  cerrado_at: string | null;
  created_at: string;
};

// Una fila del historial, tal como la devuelve la RPC historial_viajes().
// contraparte = nombre del conductor (si mirás como pasajero) o del pasajero
// (si mirás como conductor); null si el viaje se canceló sin contraparte asignada.
export type ViajeHistorial = {
  id: string;
  origen_label: string;
  destino_label: string;
  distancia_m: number;
  tarifa_estimada: number;
  estado: TripStatus;
  cerrado_at: string | null;
  created_at: string;
  contraparte: string | null;
};

export type OfferStatus = "ofrecida" | "aceptada" | "rechazada" | "vencida";

export type TripOffer = {
  id: string;
  trip_id: string;
  conductor_id: string;
  estado: OfferStatus;
  expira_at: string;
  created_at: string;
};

// Datos públicos del conductor asignado, tal como los ve el pasajero.
// ubic_vigente lo calcula el servidor (posición reciente): el pasajero no compara
// timestamps contra su propio reloj.
export type ConductorPublico = {
  nombre: string | null;
  marca: string;
  modelo: string;
  patente: string;
  color: string;
  ubic_lat: number | null;
  ubic_lng: number | null;
  ubic_vigente: boolean;
};
