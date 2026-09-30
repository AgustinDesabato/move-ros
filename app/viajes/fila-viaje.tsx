"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  fechaCorta,
  formatoKm,
  formatoPesos,
  metodoPago,
} from "@/lib/formato";
import type { ViajeHistorial } from "@/lib/supabase/types";
import { Recorrido, btnSecundario } from "@/components/ui";
import FormCalificacion, {
  ASPECTOS_CONDUCTOR,
  ASPECTOS_PASAJERO,
} from "./form-calificacion";
import ReclamoForm from "@/app/perfil/reclamos/reclamo-form";

// Badge de estado del viaje cerrado.
function Estado({ estado }: { estado: ViajeHistorial["estado"] }) {
  const finalizada = estado === "finalizada";
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
        finalizada ? "bg-exito-suave text-exito" : "bg-crema-oscuro text-tenue"
      }`}
    >
      {finalizada ? "Finalizado" : "Cancelado"}
    </span>
  );
}

// Una fila del historial: origen → destino, contraparte, distancia, fecha, tarifa
// y el estado. `fallbackContraparte` es el texto cuando no hubo contraparte
// asignada ("Sin conductor" para el pasajero, "Sin pasajero" para el conductor).
// Un viaje finalizado sin calificar ofrece un botón "Calificar" (mismo
// formulario que la pantalla de fin de viaje); ya calificado muestra "Calificado".
export default function FilaViaje({
  viaje,
  fallbackContraparte,
  esConductor,
}: {
  viaje: ViajeHistorial;
  fallbackContraparte: string;
  esConductor: boolean;
}) {
  const router = useRouter();
  const [calificando, setCalificando] = useState(false);
  const [reportando, setReportando] = useState(false);
  const fecha = fechaCorta(viaje.cerrado_at ?? viaje.created_at);
  const contraparte = viaje.contraparte ?? fallbackContraparte;
  const puedeCalificar = viaje.estado === "finalizada" && !viaje.ya_calificado;

  return (
    <li className="flex flex-col gap-3 rounded-[20px] bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-tenue">{fecha}</span>
        <Estado estado={viaje.estado} />
      </div>

      <Recorrido origen={viaje.origen_label} destino={viaje.destino_label} />

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 text-[13px] text-tenue">
          <p className="truncate text-[15px] font-semibold text-tinta">{contraparte}</p>
          <p>
            {formatoKm(viaje.distancia_m)}
            {viaje.estado === "finalizada" &&
              ` · ${metodoPago(viaje.metodo_pago)} · ${
                viaje.pago_estado === "pagado" ? "pagado" : "pendiente"
              }`}
          </p>
        </div>
        <span className="shrink-0 font-display text-xl font-bold">
          {formatoPesos(viaje.tarifa_estimada)}
        </span>
      </div>

      {viaje.estado === "finalizada" && viaje.ya_calificado && (
        <p className="border-t border-linea pt-3 text-[13px] text-tenue">Calificado</p>
      )}

      {puedeCalificar && !calificando && !reportando && (
        <button
          type="button"
          onClick={() => setCalificando(true)}
          className={`${btnSecundario} h-11 text-[15px]`}
        >
          Calificar a {contraparte}
        </button>
      )}

      {puedeCalificar && calificando && (
        <div className="border-t border-linea pt-4">
          <FormCalificacion
            tripId={viaje.id}
            aspectos={esConductor ? ASPECTOS_PASAJERO : ASPECTOS_CONDUCTOR}
            onCerrar={() => setCalificando(false)}
            onListo={() => {
              setCalificando(false);
              router.refresh();
            }}
          />
        </div>
      )}

      {!calificando && !reportando && (
        <button
          type="button"
          onClick={() => setReportando(true)}
          className="self-start text-[13px] font-semibold text-tenue underline-offset-2 hover:text-tinta hover:underline"
        >
          Reportar un problema
        </button>
      )}

      {reportando && (
        <div className="border-t border-linea pt-4">
          <ReclamoForm
            tripId={viaje.id}
            viaje={`${viaje.origen_label} → ${viaje.destino_label}`}
            onListo={() => {
              setReportando(false);
              router.refresh();
            }}
          />
        </div>
      )}
    </li>
  );
}
