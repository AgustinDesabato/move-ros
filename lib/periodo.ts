import type { Periodo } from "@/lib/supabase/types";

// Períodos de las estadísticas de la remisería, en el orden del selector. El
// rango de fechas de cada uno lo calcula la base (rango_periodo, Spec 17).
export const PERIODOS: { valor: Periodo; etiqueta: string; titulo: string }[] = [
  { valor: "hoy", etiqueta: "Hoy", titulo: "hoy" },
  { valor: "semana", etiqueta: "Semana", titulo: "esta semana" },
  { valor: "mes", etiqueta: "Mes", titulo: "este mes" },
];

// El search param ?periodo= como Periodo; cualquier otro valor cae a "hoy".
export function leerPeriodo(valor: string | string[] | undefined): Periodo {
  return PERIODOS.find((p) => p.valor === valor)?.valor ?? "hoy";
}

// Texto del período para la UI: "hoy", "esta semana", "este mes".
export function tituloPeriodo(periodo: Periodo): string {
  return PERIODOS.find((p) => p.valor === periodo)!.titulo;
}

// Rango como texto, p. ej. "29 sep – 1 oct". Las fechas llegan como
// 'YYYY-MM-DD' (días locales de Argentina): se arman en UTC y se formatean en
// UTC para que la zona del servidor no corra el día.
const fmtDia = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function dia(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return fmtDia.format(new Date(Date.UTC(a, m - 1, d))).replace(".", "");
}

export function textoRango(desde: string, hasta: string): string {
  return desde === hasta ? dia(desde) : `${dia(desde)} – ${dia(hasta)}`;
}
