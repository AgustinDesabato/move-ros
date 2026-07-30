// Comisión de plataforma sobre cada tarifa. Constante única (MVP); una comisión
// por-empresa o editable sería otro spec. Espeja lib/tarifa.ts.
export const COMISION_PLATAFORMA = 0.2; // 20%

// Reparto de una tarifa en pesos enteros. La comisión se redondea; el neto es el resto.
export function calcularReparto(tarifa: number): { comision: number; neto: number } {
  const comision = Math.round(tarifa * COMISION_PLATAFORMA);
  return { comision, neto: tarifa - comision };
}
