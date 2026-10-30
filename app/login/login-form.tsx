"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { iniciarSesion, type AuthState } from "@/app/actions/auth";
import { IconoOjo, IconoOjoTachado } from "@/components/iconos";
import { validarEmail } from "@/lib/validacion";
import { useErroresCampo } from "@/lib/use-errores-campo";
import {
  BarraSuperior,
  ErrorCampo,
  Logo,
  MensajeError,
  ariaCampo,
  btnPrimario,
  enlaceCls,
  etiquetaCls,
  inputCls,
} from "@/components/ui";

// P02 · Inicio de sesión. `aviso` llega de page.tsx (por ahora sólo el de
// cuenta suspendida, Spec 35) y se oculta en cuanto se intenta ingresar.
export default function LoginForm({ aviso }: { aviso: string | null }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    iniciarSesion,
    undefined,
  );
  const [verClave, setVerClave] = useState(false);
  const { error, validar, limpiar } = useErroresCampo(state?.errores);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <BarraSuperior titulo="Iniciar sesión" volverHref="/bienvenida" />

      <form action={action} noValidate className="flex flex-1 flex-col gap-5 px-6 pt-6 pb-10">
        <Logo
          className="mb-3 size-18 self-center rounded-[22px]"
          iconoClassName="size-10"
        />

        <label className="flex flex-col gap-2">
          <span className={etiquetaCls}>Correo electrónico</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="nombre@correo.com"
            required
            defaultValue={state?.valores?.email}
            onBlur={(e) => validar("email", validarEmail(e.target.value))}
            onChange={() => limpiar("email")}
            {...ariaCampo("email", error("email"))}
            className={inputCls}
          />
          {error("email") && <ErrorCampo id="email-error">{error("email")}</ErrorCampo>}
        </label>

        <div className="flex flex-col gap-2">
          <label htmlFor="password" className={etiquetaCls}>
            Contraseña
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={verClave ? "text" : "password"}
              autoComplete="current-password"
              required
              onChange={() => limpiar("password")}
              {...ariaCampo("password", error("password"))}
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
          {error("password") && (
            <ErrorCampo id="password-error">{error("password")}</ErrorCampo>
          )}
          <Link href="/recuperar" className={`${enlaceCls} self-end text-sm`}>
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        {state?.error ? (
          <MensajeError>{state.error}</MensajeError>
        ) : (
          !state && aviso && <MensajeError>{aviso}</MensajeError>
        )}

        <button type="submit" disabled={pending} className={`${btnPrimario} mt-3`}>
          {pending ? "Ingresando…" : "Ingresar"}
        </button>

        <div aria-hidden className="flex items-center gap-3 text-[13px] text-tenue">
          <span className="h-px flex-1 bg-linea" />o
          <span className="h-px flex-1 bg-linea" />
        </div>

        <p className="text-center text-[15px] text-tinta-suave">
          ¿No tenés cuenta?{" "}
          <Link href="/registro" className={enlaceCls}>
            Registrate
          </Link>
        </p>
      </form>
    </main>
  );
}
