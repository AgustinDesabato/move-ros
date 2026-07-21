export type UserRole = "pasajero" | "conductor";

export type Profile = {
  id: string;
  role: UserRole;
  nombre: string | null;
  telefono: string | null;
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

export type TripStatus = "pendiente" | "cancelada";

export type Trip = {
  id: string;
  pasajero_id: string;
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
  created_at: string;
};
