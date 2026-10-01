"use client";

import { useEffect, useState } from "react";
import { datosCobro } from "@/app/actions/pagos-transferencia";
import type { DatosCobro } from "@/lib/supabase/types";
import { seccionCls } from "@/components/ui";

// A quién transferirle un viaje pagado por transferencia (Spec 15): el alias/CVU
// del conductor, o de su remisería si pertenece a una. Lo resuelve el servidor;
// si el destinatario no cargó ninguno se avisa, en vez de dejar el dato vacío.
export default function DatosTransferencia({ tripId }: { tripId: string }) {
  // undefined = cargando; null = no se pudieron resolver los datos.
  const [datos, setDatos] = useState<DatosCobro | null | undefined>(undefined);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let cancelado = false;
    datosCobro(tripId).then((d) => {
      if (!cancelado) setDatos(d);
    });
    return () => {
      cancelado = true;
    };
  }, [tripId]);

  const alias = datos?.alias_cvu ?? null;
  const titular = datos?.nombre_titular ?? null;

  const copiar = async () => {
    if (!alias) return;
    await navigator.clipboard.writeText(alias);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  return (
    <div className="flex flex-col gap-2">
      <p className={seccionCls}>Datos para transferir</p>
      {datos === undefined ? (
        <p role="status" className="text-sm text-tenue">
          Buscando los datos de transferencia…
        </p>
      ) : alias ? (
        <div className="flex min-h-15 items-center gap-3 rounded-2xl bg-white px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-[13px] text-tenue">
              Transferí a {titular ?? "tu conductor"}
            </span>
            <span className="break-all font-mono text-base font-bold">{alias}</span>
          </div>
          <button
            type="button"
            onClick={copiar}
            className="h-9 shrink-0 rounded-full border-[1.5px] border-borde px-3.5 text-[13px] font-semibold text-acento transition-colors hover:bg-crema"
          >
            <span aria-live="polite">{copiado ? "Copiado" : "Copiar"}</span>
          </button>
        </div>
      ) : (
        <p className="rounded-2xl bg-white px-4 py-3 text-sm text-tenue">
          {titular ?? "Tu conductor"} todavía no cargó su alias/CVU. Coordiná el
          pago directamente.
        </p>
      )}
    </div>
  );
}
