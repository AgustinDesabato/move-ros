export type UserRole = "pasajero" | "conductor" | "empresa" | "soporte";

export type Profile = {
  id: string;
  role: UserRole;
  nombre: string | null;
  telefono: string | null;
  empresa_id: string | null;   // conductor que pertenece a una empresa (null = independiente)
  last_seen_at: string | null;
  ubic_lat: number | null;
  ubic_lng: number | null;
  ubic_at: string | null;
  alias_cvu: string | null;    // alias/CVU para cobrar transferencias (conductor y empresa)
  created_at: string;
};

// Lo que devuelve la RPC datos_cobro(trip_id) al pasajero (Spec 15): a quién
// transferirle. alias_cvu es null si el destinatario todavía no cargó ninguno.
export type DatosCobro = {
  alias_cvu: string | null;
  nombre_titular: string | null;
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

// Método de pago elegido por el pasajero al solicitar.
export type MetodoPago = "efectivo" | "digital";

// Estado del asiento de pago. 'pendiente' = efectivo sin confirmar; 'pagado' =
// efectivo confirmado por el conductor o digital (simulado) liquidado al finalizar.
export type PagoEstado = "pendiente" | "pagado";

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
  metodo_pago: MetodoPago;   // método elegido al solicitar
};

// Una fila de la tabla pagos: el asiento de pago de un viaje.
// monto = lo que paga el pasajero (= tarifa_estimada); neto = monto - comision
// (lo que recibe el destinatario: el conductor, o su empresa si pertenece a una).
export type Pago = {
  id: string;
  trip_id: string;
  destinatario_id: string;
  monto: number;
  comision: number;
  neto: number;
  estado: PagoEstado;
  created_at: string;
  pagado_at: string | null;
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
  ya_calificado: boolean;   // si el usuario actual ya calificó este viaje
  metodo_pago: MetodoPago;
  pago_estado: PagoEstado | null;   // null si el viaje no tiene pago (ej. cancelada)
  pago_neto: number | null;         // null si no hay pago
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
  promedio_estrellas: number | null;   // avg de estrellas recibidas (null si 0)
  cantidad_calificaciones: number;
};

// Promedio de estrellas recibidas por un usuario, tal como lo devuelve la RPC
// reputacion(). promedio es null cuando cantidad = 0 (sin calificaciones aún).
export type Reputacion = {
  promedio: number | null;
  cantidad: number;
};

// Período de las estadísticas de la remisería (rango_periodo en la base).
export type Periodo = "hoy" | "semana" | "mes";

// Una fila de empresa_estadisticas_conductores(p_periodo): un conductor con sus
// cifras del período. facturado/comision/recaudado salen de los pagos 'pagado'
// (facturado = recaudado + comision); pendiente_cobro, del efectivo sin confirmar.
export type EstadisticaConductor = {
  id: string;
  nombre: string | null;
  email: string;
  en_flota: boolean;        // false = ex conductor con viajes cobrados en el período
  viajes: number;
  facturado: number;
  comision: number;
  recaudado: number;
  pendiente_cobro: number;
};

// La fila de empresa_resumen(p_periodo): el rango y los totales del período.
export type ResumenEmpresa = {
  desde: string;            // 'YYYY-MM-DD', día local de Argentina
  hasta: string;
  viajes: number;
  conductores_con_viajes: number;
  conductores_flota: number;
  facturado: number;
  comision: number;
  recaudado: number;
  pendiente_cobro: number;
};

// Un viaje cerrado de un conductor, tal como lo devuelve empresa_viajes_conductor().
export type ViajeConductor = {
  id: string;
  origen_label: string;
  destino_label: string;
  distancia_m: number;
  tarifa_estimada: number;
  estado: TripStatus;
  cerrado_at: string | null;
  created_at: string;
};

export type InvitacionEstado = "pendiente" | "aceptada" | "rechazada" | "cancelada";

// Una fila de empresa_invitaciones(): una invitación pendiente, como la ve la empresa.
export type InvitacionPendiente = {
  id: string;
  conductor_id: string;
  nombre: string | null;
  email: string;
  created_at: string;
};

// Una fila de mis_invitaciones(): una invitación pendiente, como la ve el conductor.
export type MiInvitacion = {
  id: string;
  empresa_id: string;
  empresa_nombre: string | null;
  created_at: string;
};

// Un contacto de confianza guardado por el usuario (Spec 12).
export type ContactoConfianza = {
  id: string;
  usuario_id: string;
  nombre: string;
  telefono: string;
  created_at: string;
};

// Una alerta de emergencia disparada durante un viaje (Spec 12). ubic_lat/lng
// son null cuando el navegador no pudo dar un fix de GPS a tiempo.
export type AlertaEmergencia = {
  id: string;
  trip_id: string;
  usuario_id: string;
  ubic_lat: number | null;
  ubic_lng: number | null;
  created_at: string;
};

// Una alerta tal como la devuelve la RPC alertas_soporte() (Spec 23): con
// quién la disparó y el viaje asociado. Sólo la puede pedir una cuenta con
// role = 'soporte'; para cualquier otra, vacío.
export type AlertaSoporte = {
  id: string;
  trip_id: string;
  usuario_id: string;
  nombre_usuario: string | null;
  email: string;
  origen_label: string;
  destino_label: string;
  ubic_lat: number | null;
  ubic_lng: number | null;
  created_at: string;
};

// Un reclamo del usuario (Spec 13), ligado o no a un viaje (trip_id null).
export type ReclamoEstado = "abierto" | "resuelto";

export type Reclamo = {
  id: string;
  usuario_id: string;
  trip_id: string | null;
  motivo: string;
  descripcion: string;
  estado: ReclamoEstado;
  respuesta: string | null;
  resuelto_at: string | null;
  created_at: string;
};

// Un reclamo tal como lo devuelve getReclamos(), con el origen/destino del
// viaje asociado (null si el reclamo no está ligado a ningún viaje).
export type ReclamoConViaje = Reclamo & {
  trips: { origen_label: string; destino_label: string } | null;
};

// Un reclamo tal como lo devuelve la RPC reclamos_soporte() (Spec 22): todos
// los reclamos de todos los usuarios, con quién lo creó. Sólo lo puede pedir
// una cuenta con role = 'soporte'; para cualquier otra, vacío.
export type ReclamoSoporte = {
  id: string;
  usuario_id: string;
  nombre_usuario: string | null;
  email: string;
  trip_id: string | null;
  origen_label: string | null;
  destino_label: string | null;
  motivo: string;
  descripcion: string;
  estado: ReclamoEstado;
  respuesta: string | null;
  resuelto_at: string | null;
  created_at: string;
};
