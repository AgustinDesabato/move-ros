"use client";

import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  agregarContacto,
  quitarContacto,
  type ContactoState,
} from "@/app/actions/seguridad";
import type { ContactoConfianza } from "@/lib/supabase/types";
import { validarNombreContacto, validarTelefono } from "@/lib/validacion";
import { useErroresCampo } from "@/lib/use-errores-campo";
import {
  ErrorCampo,
  MensajeError,
  ariaCampo,
  btnPrimario,
  etiquetaCls,
  inputCls,
} from "@/components/ui";

const btnChico =
  "h-9 shrink-0 rounded-full border-[1.5px] border-borde px-3.5 text-[13px] font-semibold text-peligro transition-colors hover:bg-crema disabled:opacity-50";

function FilaContacto({ contacto }: { contacto: ContactoConfianza }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  const quitar = () =>
    startTransition(async () => {
      await quitarContacto(contacto.id);
      router.refresh();
    });

  return (
    <li className="flex items-center gap-3 border-b border-linea px-4 py-3 last:border-b-0">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-semibold">{contacto.nombre}</span>
        <span className="truncate text-[13px] text-tenue">{contacto.telefono}</span>
      </span>
      <button type="button" onClick={quitar} disabled={pendiente} className={btnChico}>
        Quitar
      </button>
    </li>
  );
}

// /perfil/contactos: lista de contactos de confianza + alta de uno nuevo. Se
// sugieren al compartir un viaje en curso (P07, ver Spec 12).
export default function ContactosForm({
  contactos,
}: {
  contactos: ContactoConfianza[];
}) {
  const [state, action, pending] = useActionState<ContactoState, FormData>(
    agregarContacto,
    undefined,
  );
  const { error, validar, limpiar } = useErroresCampo(state?.errores);

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 pt-2 pb-8">
      <p className="text-[15px] text-tenue">
        Los vamos a sugerir cuando compartas un viaje en curso.
      </p>

      {contactos.length > 0 && (
        <ul className="overflow-hidden rounded-[20px] bg-white">
          {contactos.map((c) => (
            <FilaContacto key={c.id} contacto={c} />
          ))}
        </ul>
      )}

      <form action={action} noValidate className="flex flex-col gap-3 rounded-[20px] bg-white p-4">
        <label className="flex flex-col gap-2">
          <span className={etiquetaCls}>Nombre</span>
          <input
            name="nombre"
            required
            defaultValue={state?.valores?.nombre}
            onBlur={(e) => validar("nombre", validarNombreContacto(e.target.value))}
            onChange={() => limpiar("nombre")}
            {...ariaCampo("nombre", error("nombre"))}
            className={inputCls}
          />
          {error("nombre") && <ErrorCampo id="nombre-error">{error("nombre")}</ErrorCampo>}
        </label>
        <label className="flex flex-col gap-2">
          <span className={etiquetaCls}>Teléfono</span>
          <input
            name="telefono"
            type="tel"
            autoComplete="tel"
            placeholder="341 555-1234"
            required
            defaultValue={state?.valores?.telefono}
            onBlur={(e) => validar("telefono", validarTelefono(e.target.value))}
            onChange={() => limpiar("telefono")}
            {...ariaCampo("telefono", error("telefono"))}
            className={inputCls}
          />
          {error("telefono") && (
            <ErrorCampo id="telefono-error">{error("telefono")}</ErrorCampo>
          )}
        </label>
        {state?.error && <MensajeError>{state.error}</MensajeError>}
        <button type="submit" disabled={pending} className={btnPrimario}>
          {pending ? "Agregando…" : "Agregar contacto"}
        </button>
      </form>
    </div>
  );
}
