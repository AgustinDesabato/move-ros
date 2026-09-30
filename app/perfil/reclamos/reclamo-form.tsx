"use client";

import { useActionState } from "react";
import { crearReclamo, type ReclamoState } from "@/app/actions/reclamos";
import { MensajeError, btnPrimario, etiquetaCls, inputCls } from "@/components/ui";

// Alta de un reclamo, ligado o no a un viaje. Lo usan /perfil/reclamos (sin
// viaje precargado) y cada fila de /viajes (con tripId + viaje ya cargados,
// ver Spec 13). onListo (opcional) se dispara al enviarse con éxito, para que
// el que lo usa inline (fila-viaje) pueda cerrar el formulario.
export default function ReclamoForm({
  tripId,
  viaje,
  onListo,
}: {
  tripId?: string;
  viaje?: string;
  onListo?: () => void;
}) {
  const [state, action, pending] = useActionState<ReclamoState, FormData>(
    async (prevState, formData) => {
      const resultado = await crearReclamo(prevState, formData);
      if (!resultado?.error) onListo?.();
      return resultado;
    },
    undefined,
  );

  return (
    <form action={action} className="flex flex-col gap-3 rounded-[20px] bg-white p-4">
      {tripId && <input type="hidden" name="trip_id" value={tripId} />}
      {viaje && (
        <p className="text-[13px] text-tenue">
          Viaje: <span className="font-semibold text-tinta">{viaje}</span>
        </p>
      )}
      <label className="flex flex-col gap-2">
        <span className={etiquetaCls}>Motivo</span>
        <input
          name="motivo"
          placeholder="Ej: cobro incorrecto"
          required
          className={inputCls}
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className={etiquetaCls}>Descripción</span>
        <textarea
          name="descripcion"
          rows={4}
          placeholder="Contanos qué pasó"
          required
          className="w-full resize-none rounded-[14px] border-[1.5px] border-borde bg-white px-4 py-3 text-base outline-none placeholder:text-tenue/80 focus:border-acento focus:ring-4 focus:ring-acento-suave disabled:opacity-50"
        />
      </label>
      {state?.error && <MensajeError>{state.error}</MensajeError>}
      <button type="submit" disabled={pending} className={btnPrimario}>
        {pending ? "Enviando…" : "Enviar reclamo"}
      </button>
    </form>
  );
}
