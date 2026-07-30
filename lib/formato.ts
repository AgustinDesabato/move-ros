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

// Método de pago como texto para mostrar. "Efectivo" / "Digital".
export function metodoPago(m: MetodoPago): string {
  return m === "digital" ? "Digital" : "Efectivo";
}
