"use client";

import { useActionState } from "react";
import { guardarPerfil, type PerfilState } from "@/app/actions/perfil";
import { cerrarSesion } from "@/app/actions/auth";
import type { Profile, Vehicle } from "@/lib/supabase/types";
import {
  BarraSuperior,
  MensajeError,
  btnPrimario,
  etiquetaCls,
  inputCls,
  seccionCls,
} from "@/components/ui";

function Campo({
  etiqueta,
  ...input
}: { etiqueta: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-2">
      <span className={etiquetaCls}>{etiqueta}</span>
      <input required className={inputCls} {...input} />
    </label>
  );
}

export default function PerfilForm({
  profile,
  vehicle,
  completo,
  sugerido,
}: {
  profile: Profile;
  vehicle: Vehicle | null;
  completo: boolean;
  sugerido: { nombre: string; telefono: string };
}) {
  const [state, action, pending] = useActionState<PerfilState, FormData>(
    guardarPerfil,
    undefined,
  );
  const esConductor = profile.role === "conductor";
  const esEmpresa = profile.role === "empresa";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <BarraSuperior
        titulo={completo ? "Editar perfil" : "Completá tu perfil"}
        volverHref={completo ? "/perfil" : undefined}
      />

      <form action={action} className="flex flex-1 flex-col gap-4 px-5 pt-2 pb-8">
        <p className="text-[15px] text-tenue">
          {esConductor
            ? "Completá tus datos y los de tu vehículo."
            : esEmpresa
              ? "Completá los datos de tu remisería."
              : "Completá tus datos para empezar a viajar."}
        </p>

        <Campo
          etiqueta={esEmpresa ? "Nombre de la remisería" : "Nombre y apellido"}
          name="nombre"
          autoComplete={esEmpresa ? "organization" : "name"}
          defaultValue={profile.nombre ?? sugerido.nombre}
        />
        <Campo
          etiqueta="Teléfono"
          name="telefono"
          type="tel"
          autoComplete="tel"
          placeholder="+54 341 …"
          defaultValue={profile.telefono ?? sugerido.telefono}
        />

        {esConductor && (
          <fieldset className="mt-2 flex flex-col gap-4">
            <legend className={`${seccionCls} mb-3`}>Tu vehículo</legend>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Marca" name="marca" defaultValue={vehicle?.marca ?? ""} />
              <Campo etiqueta="Modelo" name="modelo" defaultValue={vehicle?.modelo ?? ""} />
              <Campo
                etiqueta="Patente"
                name="patente"
                autoCapitalize="characters"
                defaultValue={vehicle?.patente ?? ""}
              />
              <Campo etiqueta="Color" name="color" defaultValue={vehicle?.color ?? ""} />
            </div>
            <Campo
              etiqueta="Capacidad (asientos)"
              name="capacidad"
              type="number"
              min={1}
              max={10}
              step={1}
              defaultValue={vehicle?.capacidad ?? ""}
            />
          </fieldset>
        )}

        {state?.error && <MensajeError>{state.error}</MensajeError>}

        <button type="submit" disabled={pending} className={`${btnPrimario} mt-auto`}>
          {pending ? "Guardando…" : "Guardar"}
        </button>
        {!completo && (
          <button
            type="submit"
            formAction={cerrarSesion}
            formNoValidate
            className="h-11 text-[15px] font-semibold text-tinta-suave underline-offset-2 hover:underline"
          >
            Cerrar sesión
          </button>
        )}
      </form>
    </main>
  );
}
