"use client";

import { useActionState } from "react";
import { resolverReclamo, type ResolverReclamoState } from "@/app/actions/reclamos";
import { MensajeError, btnPrimario, etiquetaCls } from "@/components/ui";

// Resuelve un reclamo abierto con una respuesta (Spec 22). Vive inline en
// cada fila de /soporte; al enviarse con éxito, la fila se revalida y pasa a
// mostrar la respuesta en vez de este formulario.
export default function ResolverForm({ reclamoId }: { reclamoId: string }) {
  const [state, action, pending] = useActionState<ResolverReclamoState, FormData>(
    resolverReclamo,
    undefined,
  );

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="reclamo_id" value={reclamoId} />
      <label className="flex flex-col gap-1.5">
        <span className={etiquetaCls}>Respuesta</span>
        <textarea
          name="respuesta"
          rows={3}
          placeholder="Contale a la persona cómo se resolvió"
          required
          className="w-full resize-none rounded-[14px] border-[1.5px] border-borde bg-white px-4 py-3 text-base outline-none placeholder:text-tenue/80 focus:border-acento focus:ring-4 focus:ring-acento-suave disabled:opacity-50"
        />
      </label>
      {state?.error && <MensajeError>{state.error}</MensajeError>}
      <button type="submit" disabled={pending} className={btnPrimario}>
        {pending ? "Resolviendo…" : "Marcar como resuelto"}
      </button>
    </form>
  );
}
