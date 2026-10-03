"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { registrarse, type AuthState } from "@/app/actions/auth";
import type { UserRole } from "@/lib/supabase/types";
import {
  validarEmail,
  validarNombreEmpresa,
  validarNombrePersona,
  validarTelefono,
} from "@/lib/validacion";
import { useErroresCampo } from "@/lib/use-errores-campo";
import {
  BarraSuperior,
  ErrorCampo,
  MensajeError,
  Segmentado,
  ariaCampo,
  btnPrimario,
  enlaceCls,
  etiquetaCls,
  inputCls,
} from "@/components/ui";

// P03 · Registro. El tipo de cuenta va primero porque cambia qué datos se piden:
// la remisería carga el nombre de la empresa en vez de nombre y apellido.
export default function RegistroPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    registrarse,
    undefined,
  );
  const [tipo, setTipo] = useState<UserRole>("pasajero");
  const esEmpresa = tipo === "empresa";
  const { error, validar, limpiar } = useErroresCampo(state?.errores);
  const valores = state?.valores;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <BarraSuperior titulo="Crear cuenta" volverHref="/bienvenida" />

      <form action={action} noValidate className="flex flex-1 flex-col gap-4 px-6 pt-3 pb-8">
        <div className="flex flex-col gap-2">
          <span className={etiquetaCls}>Tipo de cuenta</span>
          <Segmentado
            name="role"
            etiqueta="Tipo de cuenta"
            value={tipo}
            onChange={setTipo}
            opciones={[
              { valor: "pasajero", texto: "Pasajero" },
              { valor: "conductor", texto: "Conductor" },
              { valor: "empresa", texto: "Remisería" },
            ]}
          />
        </div>

        {esEmpresa ? (
          <label className="flex flex-col gap-2">
            <span className={etiquetaCls}>Nombre de la remisería</span>
            <input
              name="nombre"
              autoComplete="organization"
              required
              defaultValue={valores?.nombre}
              onBlur={(e) => validar("nombre", validarNombreEmpresa(e.target.value))}
              onChange={() => limpiar("nombre")}
              {...ariaCampo("nombre", error("nombre"))}
              className={inputCls}
            />
            {error("nombre") && <ErrorCampo id="nombre-error">{error("nombre")}</ErrorCampo>}
          </label>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex min-w-0 flex-col gap-2">
              <span className={etiquetaCls}>Nombre</span>
              <input
                name="nombre"
                autoComplete="given-name"
                placeholder="Juan"
                required
                defaultValue={valores?.nombre}
                onBlur={(e) =>
                  validar("nombre", validarNombrePersona(e.target.value, "nombre"))
                }
                onChange={() => limpiar("nombre")}
                {...ariaCampo("nombre", error("nombre"))}
                className={inputCls}
              />
              {error("nombre") && <ErrorCampo id="nombre-error">{error("nombre")}</ErrorCampo>}
            </label>
            <label className="flex min-w-0 flex-col gap-2">
              <span className={etiquetaCls}>Apellido</span>
              <input
                name="apellido"
                autoComplete="family-name"
                placeholder="Pérez"
                required
                defaultValue={valores?.apellido}
                onBlur={(e) =>
                  validar("apellido", validarNombrePersona(e.target.value, "apellido"))
                }
                onChange={() => limpiar("apellido")}
                {...ariaCampo("apellido", error("apellido"))}
                className={inputCls}
              />
              {error("apellido") && (
                <ErrorCampo id="apellido-error">{error("apellido")}</ErrorCampo>
              )}
            </label>
          </div>
        )}

        <label className="flex flex-col gap-2">
          <span className={etiquetaCls}>Correo electrónico</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="nombre@correo.com"
            required
            defaultValue={valores?.email}
            onBlur={(e) => validar("email", validarEmail(e.target.value))}
            onChange={() => limpiar("email")}
            {...ariaCampo("email", error("email"))}
            className={inputCls}
          />
          {error("email") && <ErrorCampo id="email-error">{error("email")}</ErrorCampo>}
        </label>

        <label className="flex flex-col gap-2">
          <span className={etiquetaCls}>Teléfono</span>
          <input
            name="telefono"
            type="tel"
            autoComplete="tel"
            placeholder="341 555-1234"
            required
            defaultValue={valores?.telefono}
            onBlur={(e) => validar("telefono", validarTelefono(e.target.value))}
            onChange={() => limpiar("telefono")}
            {...ariaCampo("telefono", error("telefono"))}
            className={inputCls}
          />
          {error("telefono") && (
            <ErrorCampo id="telefono-error">{error("telefono")}</ErrorCampo>
          )}
        </label>

        <label className="flex flex-col gap-2">
          <span className={etiquetaCls}>Contraseña</span>
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            minLength={8}
            required
            onBlur={(e) =>
              validar(
                "password",
                e.target.value.length >= 8
                  ? { ok: true }
                  : { ok: false, error: "La contraseña debe tener al menos 8 caracteres." },
              )
            }
            onChange={() => limpiar("password")}
            {...ariaCampo("password", error("password"))}
            className={inputCls}
          />
          {error("password") && (
            <ErrorCampo id="password-error">{error("password")}</ErrorCampo>
          )}
        </label>

        <label className="flex min-h-11 items-center gap-3 text-sm text-tinta-suave">
          <input
            type="checkbox"
            name="terminos"
            required
            className="size-5.5 shrink-0 accent-acento"
          />
          Acepto los términos y la política de privacidad
        </label>

        {state?.error && <MensajeError>{state.error}</MensajeError>}
        {state?.aviso && (
          <p role="status" className="rounded-[14px] bg-exito-suave px-4 py-3 text-sm font-medium text-exito">
            {state.aviso}
          </p>
        )}

        <button type="submit" disabled={pending} className={btnPrimario}>
          {pending ? "Creando…" : "Crear cuenta"}
        </button>

        <p className="text-center text-[15px] text-tinta-suave">
          ¿Ya tenés cuenta?{" "}
          <Link href="/login" className={enlaceCls}>
            Ingresá
          </Link>
        </p>
      </form>
    </main>
  );
}
