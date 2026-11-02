"use client";

import { useActionState, useState } from "react";
import { actualizarContrasena, type AuthState, type CampoAuth } from "@/app/actions/auth";
import { IconoOjo, IconoOjoTachado } from "@/components/iconos";
import { useErroresCampo } from "@/lib/use-errores-campo";
import {
  ErrorCampo,
  MensajeError,
  ariaCampo,
  btnPrimario,
  etiquetaCls,
  inputCls,
} from "@/components/ui";

// Campo de contraseña con el botón de mostrar/ocultar de /login y /restablecer.
function CampoClave({
  name,
  etiqueta,
  autoComplete,
  placeholder,
  error,
  onChange,
}: {
  name: CampoAuth;
  etiqueta: string;
  autoComplete: string;
  placeholder?: string;
  error: string | undefined;
  onChange: () => void;
}) {
  const [ver, setVer] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className={etiquetaCls}>
        {etiqueta}
      </label>
      <div className="relative">
        <input
          id={name}
          name={name}
          type={ver ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required
          onChange={onChange}
          {...ariaCampo(name, error)}
          className={`${inputCls} pr-14`}
        />
        <button
          type="button"
          onClick={() => setVer((v) => !v)}
          aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={ver}
          className="absolute top-1/2 right-1 flex size-11 -translate-y-1/2 items-center justify-center rounded-xl text-tenue transition-colors hover:text-tinta"
        >
          {ver ? <IconoOjoTachado /> : <IconoOjo />}
        </button>
      </div>
      {error && <ErrorCampo id={`${name}-error`}>{error}</ErrorCampo>}
    </div>
  );
}

// Formulario de /perfil/configuracion/contrasena: contraseña actual y nueva.
// Si sale bien, la action redirige a /perfil/configuracion con el aviso.
export default function ContrasenaForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    actualizarContrasena,
    undefined,
  );
  const { error, limpiar } = useErroresCampo(state?.errores);

  return (
    <form action={action} noValidate className="flex flex-1 flex-col gap-5 px-6 pt-6 pb-10">
      <CampoClave
        name="actual"
        etiqueta="Contraseña actual"
        autoComplete="current-password"
        error={error("actual")}
        onChange={() => limpiar("actual")}
      />
      <CampoClave
        name="password"
        etiqueta="Contraseña nueva"
        autoComplete="new-password"
        placeholder="Mínimo 8 caracteres"
        error={error("password")}
        onChange={() => limpiar("password")}
      />

      {state?.error && <MensajeError>{state.error}</MensajeError>}

      <button type="submit" disabled={pending} className={`${btnPrimario} mt-1`}>
        {pending ? "Guardando…" : "Guardar contraseña"}
      </button>
    </form>
  );
}
