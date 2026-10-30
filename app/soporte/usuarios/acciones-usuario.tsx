"use client";

import { useActionState } from "react";
import {
  aprobarConductor,
  suspenderUsuario,
  type AccionUsuarioState,
} from "@/app/actions/soporte";
import { MensajeError } from "@/components/ui";

const btnChico =
  "flex h-11 items-center justify-center rounded-xl px-4 text-[15px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-acento/30 disabled:cursor-not-allowed disabled:opacity-50";

// Aprueba a un conductor pendiente (Spec 35). Al aprobarse, la página se
// revalida y el conductor pasa a la lista general.
export function AprobarForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState<AccionUsuarioState, FormData>(
    aprobarConductor,
    undefined,
  );

  return (
    <form action={action} className="flex flex-col gap-1.5">
      <input type="hidden" name="user_id" value={userId} />
      <button
        type="submit"
        disabled={pending}
        className={`${btnChico} bg-acento text-white hover:bg-acento-oscuro`}
      >
        {pending ? "Aprobando…" : "Aprobar"}
      </button>
      {state?.error && <MensajeError>{state.error}</MensajeError>}
    </form>
  );
}

// Suspende o reactiva una cuenta (Spec 35). La RPC rechaza suspender a alguien
// con un viaje activo; el motivo se muestra debajo del botón.
export function SuspenderForm({
  userId,
  suspendido,
}: {
  userId: string;
  suspendido: boolean;
}) {
  const [state, action, pending] = useActionState<AccionUsuarioState, FormData>(
    suspenderUsuario,
    undefined,
  );

  return (
    <form action={action} className="flex flex-col items-end gap-1.5">
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="suspender" value={suspendido ? "0" : "1"} />
      <button
        type="submit"
        disabled={pending}
        className={`${btnChico} border-[1.5px] ${
          suspendido
            ? "border-borde bg-white text-tinta hover:bg-crema"
            : "border-peligro/40 bg-white text-peligro hover:bg-peligro-suave"
        }`}
      >
        {pending ? "Guardando…" : suspendido ? "Reactivar" : "Suspender"}
      </button>
      {state?.error && <MensajeError>{state.error}</MensajeError>}
    </form>
  );
}
