"use client";

import { useActionState, useState } from "react";
import { cambiarContrasena, type AuthState } from "@/app/actions/auth";
import { IconoOjo, IconoOjoTachado } from "@/components/iconos";
import { MensajeError, btnPrimario, etiquetaCls, inputCls } from "@/components/ui";

// Formulario de /restablecer: contraseña nueva, sólo se muestra si hay
// sesión de recuperación (ver page.tsx).
export default function RestablecerForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    cambiarContrasena,
    undefined,
  );
  const [verClave, setVerClave] = useState(false);

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor="password" className={etiquetaCls}>
          Contraseña nueva
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={verClave ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            minLength={8}
            required
            className={`${inputCls} pr-14`}
          />
          <button
            type="button"
            onClick={() => setVerClave((v) => !v)}
            aria-label={verClave ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-pressed={verClave}
            className="absolute top-1/2 right-1 flex size-11 -translate-y-1/2 items-center justify-center rounded-xl text-tenue transition-colors hover:text-tinta"
          >
            {verClave ? <IconoOjoTachado /> : <IconoOjo />}
          </button>
        </div>
      </div>

      {state?.error && <MensajeError>{state.error}</MensajeError>}

      <button type="submit" disabled={pending} className={`${btnPrimario} mt-1`}>
        {pending ? "Guardando…" : "Guardar contraseña"}
      </button>
    </form>
  );
}
