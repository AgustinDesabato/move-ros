import { useState } from "react";
import type { ErroresCampo } from "@/lib/validacion";

type ResultadoValidacion = { ok: true } | { ok: false; error: string };

// Errores por campo de un formulario (Spec 19): combina los que devolvió la
// Server Action con los que detecta el cliente al salir de cada campo. El del
// cliente manda mientras el usuario edita; un envío nuevo vuelve a mostrar los
// del servidor. Escribir en un campo limpia su error hasta el próximo blur.
export function useErroresCampo<C extends string>(servidor: ErroresCampo<C> | undefined) {
  const [cliente, setCliente] = useState<Partial<Record<C, string | null>>>({});
  const [servidorPrevio, setServidorPrevio] = useState(servidor);
  if (servidor !== servidorPrevio) {
    setServidorPrevio(servidor);
    setCliente({});
  }

  function error(campo: C): string | undefined {
    if (campo in cliente) return cliente[campo] ?? undefined;
    return servidor?.[campo];
  }

  function validar(campo: C, resultado: ResultadoValidacion) {
    setCliente((prev) => ({ ...prev, [campo]: resultado.ok ? null : resultado.error }));
  }

  function limpiar(campo: C) {
    setCliente((prev) => (prev[campo] === null ? prev : { ...prev, [campo]: null }));
  }

  return { error, validar, limpiar };
}
