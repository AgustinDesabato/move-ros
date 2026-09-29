"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { registrarse, type AuthState } from "@/app/actions/auth";
import type { UserRole } from "@/lib/supabase/types";
import {
  BarraSuperior,
  MensajeError,
  Segmentado,
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

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <BarraSuperior titulo="Crear cuenta" volverHref="/bienvenida" />

      <form action={action} className="flex flex-1 flex-col gap-4 px-6 pt-3 pb-8">
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
              className={inputCls}
            />
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
                className={inputCls}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-2">
              <span className={etiquetaCls}>Apellido</span>
              <input
                name="apellido"
                autoComplete="family-name"
                placeholder="Pérez"
                required
                className={inputCls}
              />
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
            className={inputCls}
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className={etiquetaCls}>Teléfono</span>
          <input
            name="telefono"
            type="tel"
            autoComplete="tel"
            placeholder="+54 341 …"
            required
            className={inputCls}
          />
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
            className={inputCls}
          />
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
