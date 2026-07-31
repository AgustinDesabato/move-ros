"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  aceptarInvitacion,
  rechazarInvitacion,
} from "@/app/actions/invitaciones";
import type { MiInvitacion } from "@/lib/supabase/types";

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
    <li className="rounded-2xl border border-black/10 p-4 dark:border-white/15">
      <p className="text-sm">
        <span className="font-medium">
          {invitacion.empresa_nombre ?? "Una remisería"}
        </span>{" "}
        te invitó a su flota.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={aceptar}
          disabled={pendiente}
          className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Aceptar
        </button>
        <button
          type="button"
          onClick={rechazar}
          disabled={pendiente}
          className="rounded-full border border-black/15 px-4 py-1.5 text-sm font-medium transition-colors hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
        >
          Rechazar
        </button>
      </div>
      {error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
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
    <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-black/10 bg-white p-8 dark:border-white/15 dark:bg-zinc-950">
      {empresaNombre && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Tu remisería:{" "}
          <span className="font-medium text-foreground">{empresaNombre}</span>
        </p>
      )}

      {invitaciones.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Invitaciones de remiserías</h2>
          <ul className="flex flex-col gap-2">
            {invitaciones.map((i) => (
              <FilaInvitacion key={i.id} invitacion={i} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
