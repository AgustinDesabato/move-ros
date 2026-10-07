import type { Reputacion, MetodoPago } from "@/lib/supabase/types";

// Formato de fecha corto y legible en español, p. ej. "22 jul 2026, 14:30".
// Usado por el historial de viajes para fechar el cierre de cada viaje.
const fmt = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function fechaCorta(iso: string): string {
  return fmt.format(new Date(iso));
}

// Reputación como texto, p. ej. "★ 4.8 (12)". Sin calificaciones recibidas
// (cantidad = 0) devuelve "Sin calificaciones aún" en vez de un promedio falso.
export function estrellas(rep: Reputacion): string {
  if (rep.cantidad === 0 || rep.promedio === null) {
    return "Sin calificaciones aún";
  }
  return `★ ${rep.promedio.toFixed(1)} (${rep.cantidad})`;
}

// Reputación compacta para tarjetas, p. ej. "★ 4,8"; "Nuevo" sin calificaciones.
export function estrellasCorto(rep: {
  promedio: number | null;
  cantidad: number;
}): string {
  if (rep.cantidad === 0 || rep.promedio === null) return "Nuevo";
  return `★ ${rep.promedio.toLocaleString("es-AR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}`;
}

// Método de pago como texto para mostrar. "Efectivo" / "Transferencia" (el
// valor interno sigue siendo 'digital', ver Spec 15).
export function metodoPago(m: MetodoPago): string {
  return m === "digital" ? "Transferencia" : "Efectivo";
}

// "$4.200"
export function formatoPesos(n: number): string {
  return `$${n.toLocaleString("es-AR")}`;
}

// "$186 mil": para indicadores donde el monto exacto no entra.
const compacto = new Intl.NumberFormat("es-AR", {
  notation: "compact",
  maximumFractionDigits: 1,
});
export function formatoPesosCompacto(n: number): string {
  return n < 10000 ? formatoPesos(n) : `$${compacto.format(n)}`;
}

// "5,4 km"
export function formatoKm(metros: number): string {
  const km = (metros / 1000).toLocaleString("es-AR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${km} km`;
}

// "12 min" (nunca menos de 1).
export function formatoMin(segundos: number): string {
  return `${Math.max(1, Math.round(segundos / 60))} min`;
}

// Spec 27: "Llega en 4 min" (aceptada) / "Llegás en 12 min" (en_curso).
// Con menos de un minuto: "Llegando" / "Llegando a destino". Redondea hacia
// arriba: para una llegada es mejor prometer de más que de menos.
export function formatoEta(
  segundos: number,
  estado: "aceptada" | "en_curso",
): string {
  const enCurso = estado === "en_curso";
  if (segundos < 60) return enCurso ? "Llegando a destino" : "Llegando";
  const min = Math.ceil(segundos / 60);
  return `${enCurso ? "Llegás" : "Llega"} en ${min} min`;
}

// Iniciales para los avatares: "Juan Pérez" → "JP".
export function iniciales(nombre: string | null | undefined): string {
  const partes = (nombre ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  return partes
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

// Distancia en línea recta entre dos coordenadas, en metros (haversine).
export function distanciaMetros(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// "octubre de 2026", a partir del primer día del mes ("2026-10-01") que
// devuelve comentarios_recibidos() (Spec 29). En UTC: la fecha no trae hora y
// con la zona local caería en el mes anterior.
const fmtMes = new Intl.DateTimeFormat("es-AR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
export function mesAnio(iso: string): string {
  return fmtMes.format(new Date(iso));
}
