"use client";

import { useActionState } from "react";
import {
  guardarAliasCvu,
  type AliasState,
} from "@/app/actions/pagos-transferencia";
import { validarAliasCvu } from "@/lib/validacion";
import { useErroresCampo } from "@/lib/use-errores-campo";
import {
  ErrorCampo,
  MensajeError,
  ariaCampo,
  btnPrimario,
  etiquetaCls,
  inputCls,
} from "@/components/ui";

// /perfil/pagos: el conductor o la remisería carga el alias/CVU que el pasajero
// ve en el recibo de un viaje pagado por transferencia (Spec 15).
export default function PagosForm({
  alias,
  empresaNombre,
}: {
  alias: string | null;
  empresaNombre: string | null;
}) {
  const [state, action, pending] = useActionState<AliasState, FormData>(
    guardarAliasCvu,
    undefined,
  );
  const conErrores = state && !("ok" in state) ? state : undefined;
  const { error, validar, limpiar } = useErroresCampo(conErrores?.errores);

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 pt-2 pb-8">
      <p className="text-[15px] text-tenue">
        El pasajero ve este alias o CVU en el recibo cuando paga el viaje por
        transferencia.
      </p>

      {empresaNombre && (
        <p className="rounded-2xl bg-acento-suave px-4 py-3 text-sm text-acento-oscuro">
          Pertenecés a {empresaNombre}: mientras sigas en la remisería, el
          pasajero ve el alias de la remisería y no el tuyo.
        </p>
      )}

      <form action={action} className="flex flex-col gap-3 rounded-[20px] bg-white p-4">
        <label className="flex flex-col gap-2">
          <span className={etiquetaCls}>Alias o CVU</span>
          <input
            name="alias_cvu"
            defaultValue={conErrores?.valores?.alias_cvu ?? alias ?? ""}
            placeholder="mi.alias.mp"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={40}
            required
            onBlur={(e) => validar("alias_cvu", validarAliasCvu(e.target.value))}
            onChange={() => limpiar("alias_cvu")}
            {...ariaCampo("alias_cvu", error("alias_cvu"))}
            className={inputCls}
          />
          {error("alias_cvu") && (
            <ErrorCampo id="alias_cvu-error">{error("alias_cvu")}</ErrorCampo>
          )}
        </label>
        {conErrores?.error && <MensajeError>{conErrores.error}</MensajeError>}
        {state && "ok" in state && (
          <p role="status" className="text-sm font-medium text-exito">
            Alias guardado.
          </p>
        )}
        <button type="submit" disabled={pending} className={btnPrimario}>
          {pending ? "Guardando…" : "Guardar"}
        </button>
      </form>
    </div>
  );
}
