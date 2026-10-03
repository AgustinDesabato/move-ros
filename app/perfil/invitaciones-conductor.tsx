"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  aceptarInvitacion,
  rechazarInvitacion,
} from "@/app/actions/invitaciones";
import type { MiInvitacion } from "@/lib/supabase/types";
import { MensajeError, seccionCls } from "@/components/ui";

// Una invitación pendiente con botones para aceptarla o rechazarla.
function FilaInvitacion({ invitacion }: { invitacion: MiInvitacion }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const aceptar = () =>
    startTransition(async () => {
      setError(null);
      const res = await aceptarInvitacion(invitacion.id);
      if (res?.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });

  const rechazar = () =>
    startTransition(async () => {
      await rechazarInvitacion(invitacion.id);
      router.refresh();
    });

  return (
    <li className="flex flex-col gap-3 rounded-[20px] border-2 border-acento bg-white p-4">
      <p className="text-[15px]">
        <span className="font-bold">
          {invitacion.empresa_nombre ?? "Una remisería"}
        </span>{" "}
        te invitó a su flota.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={rechazar}
          disabled={pendiente}
          className="h-11 flex-1 rounded-xl border-[1.5px] border-borde text-[15px] font-semibold transition-colors hover:bg-crema disabled:opacity-50"
        >
          Rechazar
        </button>
        <button
          type="button"
          onClick={aceptar}
          disabled={pendiente}
          className="h-11 flex-[2] rounded-xl bg-acento text-[15px] font-bold text-white transition-colors hover:bg-acento-oscuro disabled:opacity-50"
        >
          Aceptar
        </button>
      </div>
      {error && <MensajeError>{error}</MensajeError>}
    </li>
  );
}

// Sección de /perfil para el conductor: las invitaciones pendientes que puede
// aceptar/rechazar y, si ya pertenece a una remisería, una línea read-only con
// su nombre. No renderiza nada si no hay invitaciones ni remisería.
export default function InvitacionesConductor({
  invitaciones,
  empresaNombre,
}: {
  invitaciones: MiInvitacion[];
  empresaNombre: string | null;
}) {
  if (invitaciones.length === 0 && !empresaNombre) return null;

  return (
    <div className="flex flex-col gap-3">
      {empresaNombre && (
        <p className="rounded-[20px] bg-white px-4 py-3.5 text-[15px] text-tenue">
          Tu remisería:{" "}
          <span className="font-bold text-tinta">{empresaNombre}</span>
        </p>
      )}

      {invitaciones.length > 0 && (
        <>
          <h2 className={seccionCls}>Invitaciones de remiserías</h2>
          <ul className="flex flex-col gap-2">
            {invitaciones.map((i) => (
              <FilaInvitacion key={i.id} invitacion={i} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
