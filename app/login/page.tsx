"use client";

import Link from "next/link";
import { useActionState } from "react";
import { iniciarSesion, type AuthState } from "@/app/actions/auth";

export default function LoginPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    iniciarSesion,
    undefined,
  );

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <form
        action={action}
        className="flex w-full max-w-sm flex-col gap-5 rounded-2xl border border-black/10 bg-white p-8 dark:border-white/15 dark:bg-zinc-950"
      >
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Iniciar sesión
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Bienvenido de nuevo a Move Ros.
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
            autoComplete="current-password"
            required
            className="rounded-lg border border-black/15 bg-transparent px-3 py-2 text-base outline-none focus:border-black dark:border-white/20 dark:focus:border-white"
          />
        </label>

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
          {pending ? "Ingresando…" : "Ingresar"}
        </button>

        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
          ¿No tenés cuenta?{" "}
          <Link href="/registro" className="font-medium underline">
            Registrate
          </Link>
        </p>
      </form>
    </main>
  );
}
