"use client";

import { useActionState } from "react";
import { guardarPerfil, type PerfilState } from "@/app/actions/perfil";
import type { MiInvitacion, Profile, Vehicle } from "@/lib/supabase/types";
import InvitacionesConductor from "./invitaciones-conductor";

const inputCls =
  "rounded-lg border border-black/15 bg-transparent px-3 py-2 text-base outline-none focus:border-black dark:border-white/20 dark:focus:border-white";

export default function PerfilForm({
  profile,
  vehicle,
  reputacion,
  invitaciones = [],
  empresaNombre = null,
}: {
  profile: Profile;
  vehicle: Vehicle | null;
  reputacion: string;
  invitaciones?: MiInvitacion[];
  empresaNombre?: string | null;
}) {
  const [state, action, pending] = useActionState<PerfilState, FormData>(
    guardarPerfil,
    undefined,
  );
  const esConductor = profile.role === "conductor";
  const esEmpresa = profile.role === "empresa";

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-16">
      {esConductor && (
        <InvitacionesConductor
          invitaciones={invitaciones}
          empresaNombre={empresaNombre}
        />
      )}
      <form
        action={action}
        className="flex w-full max-w-sm flex-col gap-5 rounded-2xl border border-black/10 bg-white p-8 dark:border-white/15 dark:bg-zinc-950"
      >
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Mi perfil</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {esConductor
              ? "Completá tus datos y los de tu vehículo."
              : esEmpresa
                ? "Completá los datos de tu remisería."
                : "Completá tus datos para empezar a viajar."}
          </p>
          {!esEmpresa && (
            <p className="mt-1 text-sm font-medium text-amber-600 dark:text-amber-500">
              {reputacion}
            </p>
          )}
        </div>

        <label className="flex flex-col gap-1 text-sm font-medium">
          {esEmpresa ? "Nombre de la remisería" : "Nombre"}
          <input
            name="nombre"
            type="text"
            defaultValue={profile.nombre ?? ""}
            required
            className={inputCls}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Teléfono
          <input
            name="telefono"
            type="tel"
            defaultValue={profile.telefono ?? ""}
            required
            className={inputCls}
          />
        </label>

        {esConductor && (
          <fieldset className="flex flex-col gap-4 border-t border-black/10 pt-4 dark:border-white/15">
            <legend className="text-sm font-semibold">Tu vehículo</legend>

            <label className="flex flex-col gap-1 text-sm font-medium">
              Marca
              <input
                name="marca"
                type="text"
                defaultValue={vehicle?.marca ?? ""}
                required
                className={inputCls}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium">
              Modelo
              <input
                name="modelo"
                type="text"
                defaultValue={vehicle?.modelo ?? ""}
                required
                className={inputCls}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium">
              Patente
              <input
                name="patente"
                type="text"
                defaultValue={vehicle?.patente ?? ""}
                required
                className={inputCls}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium">
              Color
              <input
                name="color"
                type="text"
                defaultValue={vehicle?.color ?? ""}
                required
                className={inputCls}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium">
              Capacidad (asientos)
              <input
                name="capacidad"
                type="number"
                min={1}
                max={10}
                step={1}
                defaultValue={vehicle?.capacidad ?? ""}
                required
                className={inputCls}
              />
            </label>
          </fieldset>
        )}

        {state?.error && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
      </form>
    </main>
  );
}
