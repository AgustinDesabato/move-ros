// Valores MVP para Rosario, en pesos. Revisables.
export const TARIFA_BASE = 700; // bandera de bajada
export const TARIFA_KM = 250; // por kilómetro
export const TARIFA_MIN = 40; // por minuto
export const TARIFA_MINIMA = 1000; // piso

// tarifa = max(MINIMA, BASE + km*KM + min*MIN), redondeada a $50.
export function calcularTarifa(distanciaM: number, duracionS: number): number {
  const km = distanciaM / 1000;
  const min = duracionS / 60;
  const bruta = TARIFA_BASE + km * TARIFA_KM + min * TARIFA_MIN;
  const redondeada = Math.round(bruta / 50) * 50;
  return Math.max(TARIFA_MINIMA, redondeada);
}
