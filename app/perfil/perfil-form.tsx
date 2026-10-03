"use client";

import { useActionState, useState } from "react";
import { guardarPerfil, type CampoPerfil, type PerfilState } from "@/app/actions/perfil";
import { cerrarSesion } from "@/app/actions/auth";
import type { Profile, Vehicle } from "@/lib/supabase/types";
import {
  COLORES,
  MARCAS,
  validarCapacidad,
  validarColor,
  validarMarca,
  validarNombreCompleto,
  validarNombreEmpresa,
  validarPatente,
  validarTelefono,
  validarTextoVehiculo,
} from "@/lib/validacion";
import { useErroresCampo } from "@/lib/use-errores-campo";
import {
  BarraSuperior,
  ErrorCampo,
  MensajeError,
  ariaCampo,
  btnPrimario,
  etiquetaCls,
  inputCls,
  seccionCls,
} from "@/components/ui";

function Campo({
  etiqueta,
  name,
  error,
  ...input
}: { etiqueta: string; name: CampoPerfil; error: string | undefined } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "name"
>) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className={etiquetaCls}>{etiqueta}</span>
      <input required name={name} className={inputCls} {...ariaCampo(name, error)} {...input} />
      {error && <ErrorCampo id={`${name}-error`}>{error}</ErrorCampo>}
    </label>
  );
}

// Campo de lista cerrada (marca, color): un <select> con una opción vacía
// inicial para obligar a elegir.
function CampoLista({
  etiqueta,
  name,
  error,
  opciones,
  ...select
}: {
  etiqueta: string;
  name: CampoPerfil;
  error: string | undefined;
  opciones: readonly string[];
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "name">) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className={etiquetaCls}>{etiqueta}</span>
      <select required name={name} className={inputCls} {...ariaCampo(name, error)} {...select}>
        <option value="" disabled>
          Elegí…
        </option>
        {opciones.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {error && <ErrorCampo id={`${name}-error`}>{error}</ErrorCampo>}
    </label>
  );
}

// Valor guardado como opción del <select>: si no está en la lista (vehículos
// cargados antes del Spec 19), queda sin elegir y el conductor lo corrige.
function valorDeLista(guardado: string | undefined, validador: typeof validarMarca): string {
  if (!guardado) return "";
  const r = validador(guardado);
  return r.ok ? r.valor : "";
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
  const { error, validar, limpiar } = useErroresCampo(state?.errores);
  const valores = state?.valores;
  // Cuenta las respuestas de la acción. Los <select> se remontan con cada una:
  // React fija la opción por defecto sólo al montar, y el reset automático del
  // formulario los devolvería a la opción guardada antes en vez de a la última
  // elegida.
  const [envio, setEnvio] = useState({ state, n: 0 });
  if (envio.state !== state) setEnvio({ state, n: envio.n + 1 });
  // Props comunes de cada campo: error, validación al salir y limpieza al
  // escribir, con el valor del último envío si lo hubo.
  const campo = (
    name: CampoPerfil,
    validador: (v: string) => { ok: true } | { ok: false; error: string },
    inicial: string | number,
  ) => ({
    name,
    error: error(name),
    defaultValue: valores?.[name] ?? inicial,
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) =>
      validar(name, validador(e.target.value)),
    onChange: () => limpiar(name),
  });

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <BarraSuperior
        titulo={completo ? "Editar perfil" : "Completá tu perfil"}
        volverHref={completo ? "/perfil" : undefined}
      />

      <form action={action} noValidate className="flex flex-1 flex-col gap-4 px-5 pt-2 pb-8">
        <p className="text-[15px] text-tenue">
          {esConductor
            ? "Completá tus datos y los de tu vehículo."
            : esEmpresa
              ? "Completá los datos de tu remisería."
              : "Completá tus datos para empezar a viajar."}
        </p>

        <Campo
          etiqueta={esEmpresa ? "Nombre de la remisería" : "Nombre y apellido"}
          autoComplete={esEmpresa ? "organization" : "name"}
          {...campo(
            "nombre",
            esEmpresa ? validarNombreEmpresa : validarNombreCompleto,
            profile.nombre ?? sugerido.nombre,
          )}
        />
        <Campo
          etiqueta="Teléfono"
          type="tel"
          autoComplete="tel"
          placeholder="341 555-1234"
          {...campo("telefono", validarTelefono, profile.telefono ?? sugerido.telefono)}
        />

        {esConductor && (
          <fieldset className="mt-2 flex flex-col gap-4">
            <legend className={`${seccionCls} mb-3`}>Tu vehículo</legend>
            <div className="grid grid-cols-2 gap-3">
              <CampoLista
                key={`marca-${envio.n}`}
                etiqueta="Marca"
                opciones={MARCAS}
                {...campo("marca", validarMarca, valorDeLista(vehicle?.marca, validarMarca))}
              />
              <Campo
                etiqueta="Modelo"
                placeholder="Corolla"
                {...campo("modelo", (v) => validarTextoVehiculo(v, "modelo"), vehicle?.modelo ?? "")}
              />
              <Campo
                etiqueta="Patente"
                autoCapitalize="characters"
                placeholder="AB123CD"
                {...campo("patente", validarPatente, vehicle?.patente ?? "")}
              />
              <CampoLista
                key={`color-${envio.n}`}
                etiqueta="Color"
                opciones={COLORES}
                {...campo("color", validarColor, valorDeLista(vehicle?.color, validarColor))}
              />
              <Campo
                etiqueta="Capacidad (asientos)"
                type="number"
                min={1}
                max={10}
                step={1}
                {...campo("capacidad", validarCapacidad, vehicle?.capacidad ?? "")}
              />
            </div>
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
