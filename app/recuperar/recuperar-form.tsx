"use client";

import Link from "next/link";
import { useActionState } from "react";
import { pedirRecuperacion, type AuthState } from "@/app/actions/auth";
import {
  Logo,
  MensajeError,
  btnPrimario,
  enlaceCls,
  etiquetaCls,
  inputCls,
} from "@/components/ui";

// Formulario de /recuperar: pide el email y llama a pedirRecuperacion.
// errorLink viene de /auth/confirmar cuando el link del mail venció o ya se
// usó (ver Spec 14).
export default function RecuperarForm({ errorLink }: { errorLink: boolean }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    pedirRecuperacion,
    undefined,
  );

  return (
    <form action={action} className="flex flex-1 flex-col gap-5 px-6 pt-6 pb-10">
      <Logo
        className="mb-3 size-18 self-center rounded-[22px]"
        iconoClassName="size-10"
      />

      <p className="text-center text-[15px] text-tinta-suave">
        Ingresá tu email y te mandamos un link para elegir una contraseña nueva.
      </p>

      {errorLink && (
        <MensajeError>El link venció o no es válido. Pedí uno nuevo.</MensajeError>
      )}

      <label className="flex flex-col gap-2">
        <span className={etiquetaCls}>Correo electrónico</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          placeholder="nombre@correo.com"
          required
          className={inputCls}
        />
      </label>

      {state?.error && <MensajeError>{state.error}</MensajeError>}
      {state?.aviso && (
        <p
          role="status"
          className="rounded-[14px] bg-exito-suave px-4 py-3 text-sm font-medium text-exito"
        >
          {state.aviso}
        </p>
      )}

      <button type="submit" disabled={pending} className={`${btnPrimario} mt-3`}>
        {pending ? "Enviando…" : "Enviar link"}
      </button>

      <p className="text-center text-[15px] text-tinta-suave">
        <Link href="/login" className={enlaceCls}>
          Volver a iniciar sesión
        </Link>
      </p>
    </form>
  );
}
