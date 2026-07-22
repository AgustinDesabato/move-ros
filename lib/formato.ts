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
