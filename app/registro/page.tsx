"use client";

import Link from "next/link";
import { useActionState } from "react";
import { registrarse, type AuthState } from "@/app/actions/auth";

export default function RegistroPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    registrarse,
    undefined,
  );

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <form
        action={action}
        className="flex w-full max-w-sm flex-col gap-5 rounded-2xl border border-black/10 bg-white p-8 dark:border-white/15 dark:bg-zinc-950"
      >
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Crear cuenta</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Move Ros — movilidad en Rosario y alrededores.
          </p>
        </div>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className="rounded-lg border border-black/15 bg-transparent px-3 py-2 text-base outline-none focus:border-black dark:border-white/20 dark:focus:border-white"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Contraseña
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className="rounded-lg border border-black/15 bg-transparent px-3 py-2 text-base outline-none focus:border-black dark:border-white/20 dark:focus:border-white"
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Quiero</legend>
          <div className="flex gap-3">
            <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-black/15 px-3 py-2 text-sm has-[:checked]:border-black has-[:checked]:font-semibold dark:border-white/20 dark:has-[:checked]:border-white">
              <input
                type="radio"
                name="role"
                value="pasajero"
                defaultChecked
              />
              Viajar
            </label>
            <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-black/15 px-3 py-2 text-sm has-[:checked]:border-black has-[:checked]:font-semibold dark:border-white/20 dark:has-[:checked]:border-white">
              <input type="radio" name="role" value="conductor" />
              Conducir
            </label>
            <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-black/15 px-3 py-2 text-sm has-[:checked]:border-black has-[:checked]:font-semibold dark:border-white/20 dark:has-[:checked]:border-white">
              <input type="radio" name="role" value="empresa" />
              Remisería
            </label>
          </div>
        </fieldset>

        {state?.error && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {state.error}
          </p>
        )}

        {state?.aviso && (
          <p className="text-sm text-emerald-700 dark:text-emerald-400">
            {state.aviso}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Creando…" : "Crear cuenta"}
        </button>

        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
          ¿Ya tenés cuenta?{" "}
          <Link href="/login" className="font-medium underline">
            Iniciá sesión
          </Link>
        </p>
      </form>
    </main>
  );
}
