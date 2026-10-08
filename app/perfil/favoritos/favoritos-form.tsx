"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  agregarFavorito,
  quitarFavorito,
  type FavoritoState,
} from "@/app/actions/favoritos";
import BuscadorDireccion from "@/app/viajar/buscador-direccion";
import type { Place } from "@/lib/geocode";
import type { LugarFavorito } from "@/lib/supabase/types";
import { FAVORITOS_MAX, validarNombreLugar } from "@/lib/validacion";
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

function FilaFavorito({ favorito }: { favorito: LugarFavorito }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  const quitar = () =>
    startTransition(async () => {
      await quitarFavorito(favorito.id);
      router.refresh();
    });

  return (
    <li className="flex items-center gap-3 border-b border-linea px-4 py-3 last:border-b-0">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-semibold">{favorito.nombre}</span>
        <span className="truncate text-[13px] text-tenue">{favorito.direccion}</span>
      </span>
      <button type="button" onClick={quitar} disabled={pendiente} className={btnChico}>
        Quitar
      </button>
    </li>
  );
}

// Alta de un lugar: nombre + dirección elegida en el buscador de P04. La
// dirección y sus coordenadas viajan en campos ocultos; sólo se completan al
// elegir una sugerencia.
function AltaFavorito() {
  const [state, action, pending] = useActionState<FavoritoState, FormData>(
    agregarFavorito,
    undefined,
  );
  const { error, validar, limpiar } = useErroresCampo(state?.errores);
  const [lugar, setLugar] = useState<Place | null>(null);

  return (
    <form action={action} noValidate className="flex flex-col gap-3 rounded-[20px] bg-white p-4">
      <label className="flex flex-col gap-2">
        <span className={etiquetaCls}>Nombre</span>
        <input
          name="nombre"
          placeholder="Casa, Trabajo…"
          required
          defaultValue={state?.valores?.nombre}
          onBlur={(e) => validar("nombre", validarNombreLugar(e.target.value))}
          onChange={() => limpiar("nombre")}
          {...ariaCampo("nombre", error("nombre"))}
          className={inputCls}
        />
        {error("nombre") && <ErrorCampo id="nombre-error">{error("nombre")}</ErrorCampo>}
      </label>

      <div className="flex flex-col gap-2">
        <BuscadorDireccion
          etiqueta="Dirección"
          marcador="destino"
          placeholder="Buscá la dirección"
          onSelect={(p) => {
            setLugar(p);
            limpiar("direccion");
          }}
        />
        {error("direccion") && (
          <ErrorCampo id="direccion-error">{error("direccion")}</ErrorCampo>
        )}
      </div>
      <input type="hidden" name="direccion" value={lugar?.label ?? ""} />
      <input type="hidden" name="lat" value={lugar?.lat ?? ""} />
      <input type="hidden" name="lng" value={lugar?.lng ?? ""} />

      {state?.error && <MensajeError>{state.error}</MensajeError>}
      <button type="submit" disabled={pending} className={btnPrimario}>
        {pending ? "Guardando…" : "Guardar lugar"}
      </button>
    </form>
  );
}

// /perfil/favoritos: lista de lugares guardados + alta de uno nuevo. Se
// ofrecen como destino en P04, arriba de los recientes (ver Spec 26).
export default function FavoritosForm({ favoritos }: { favoritos: LugarFavorito[] }) {
  return (
    <div className="flex flex-1 flex-col gap-4 px-5 pt-2 pb-8">
      <p className="text-[15px] text-tenue">
        Los vas a poder elegir como destino al pedir un viaje.
      </p>

      {favoritos.length > 0 && (
        <ul className="overflow-hidden rounded-[20px] bg-white">
          {favoritos.map((f) => (
            <FilaFavorito key={f.id} favorito={f} />
          ))}
        </ul>
      )}

      {favoritos.length >= FAVORITOS_MAX ? (
        <p className="rounded-2xl bg-white px-4 py-4 text-sm text-tenue">
          Podés guardar hasta {FAVORITOS_MAX} lugares. Quitá uno para agregar otro.
        </p>
      ) : (
        // La key cambia al guardar un lugar: el formulario se remonta vacío.
        <AltaFavorito key={favoritos.length} />
      )}
    </div>
  );
}
