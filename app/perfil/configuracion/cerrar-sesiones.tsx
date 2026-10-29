"use client";

import { useState, useTransition } from "react";
import { cerrarSesionGlobal } from "@/app/actions/auth";
import { IconoSalir } from "@/components/iconos";
import { MensajeError } from "@/components/ui";

// Fila "Cerrar sesión en todos los dispositivos" de /perfil/configuracion
// (Spec 32). Al tocarla, la misma fila pide confirmación; si el cierre falla
// vuelve al estado normal con el error debajo. Si sale bien, la action
// redirige a /bienvenida.
export default function CerrarSesiones() {
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const cerrar = () =>
    startTransition(async () => {
      setError(null);
      const res = await cerrarSesionGlobal();
      if (res?.error) {
        setError(res.error);
        setConfirmando(false);
      }
    });

  return (
    <li className="flex flex-col">
      {confirmando ? (
        <div className="flex flex-col gap-3 px-4 py-3.5">
          <p className="text-[15px]">
            ¿Cerrar sesión en todos tus dispositivos? Vas a tener que volver a
            ingresar en cada uno.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              disabled={pendiente}
              className="h-11 flex-1 rounded-xl border-[1.5px] border-borde text-[15px] font-semibold transition-colors hover:bg-crema disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={cerrar}
              disabled={pendiente}
              className="h-11 flex-1 rounded-xl border-[1.5px] border-borde text-[15px] font-bold text-peligro transition-colors hover:bg-crema disabled:opacity-50"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setConfirmando(true);
          }}
          className="flex min-h-15 w-full items-center gap-3.5 px-4 text-left transition-colors hover:bg-crema/60"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-crema text-peligro">
            <IconoSalir />
          </span>
          <span className="flex-1 text-base font-medium text-peligro">
            Cerrar sesión en todos los dispositivos
          </span>
        </button>
      )}
      {error && (
        <div className="px-4 pb-3.5">
          <MensajeError>{error}</MensajeError>
        </div>
      )}
    </li>
  );
}
