"use client";

import dynamic from "next/dynamic";
import { fechaCorta } from "@/lib/formato";
import type { AlertaSoporte } from "@/lib/supabase/types";

const MapaAlertas = dynamic(() => import("./mapa-alertas"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-mapa" />,
});

function FilaAlerta({ alerta }: { alerta: AlertaSoporte }) {
  return (
    <li className="flex flex-col gap-1.5 border-b border-linea px-4 py-3.5 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 truncate text-[15px] font-semibold">
          {alerta.nombre_usuario ?? alerta.email}
        </span>
        <div className="flex shrink-0 gap-1.5">
          {/* Quién pidió ayuda (Spec 31): a quién hay que llamar. */}
          <span className="rounded-full bg-crema px-2.5 py-1 text-xs font-semibold text-tinta-suave">
            {alerta.rol === "conductor" ? "Conductor" : "Pasajero"}
          </span>
          {alerta.ubic_lat == null && (
            <span className="rounded-full bg-crema-oscuro px-2.5 py-1 text-xs font-semibold text-tenue">
              Sin ubicación
            </span>
          )}
        </div>
      </div>
      <p className="truncate text-[13px] text-tenue">
        {alerta.origen_label} → {alerta.destino_label}
      </p>
      <p className="text-[13px] text-tenue">{fechaCorta(alerta.created_at)}</p>
    </li>
  );
}

// Mapa (una alerta ubicada = un marcador) + lista completa debajo (Spec 23).
// Client Component porque el mapa necesita cargarse sin SSR (Leaflet usa window).
export default function VistaAlertas({ alertas }: { alertas: AlertaSoporte[] }) {
  return (
    <>
      <div className="h-64 overflow-hidden rounded-[20px]">
        <MapaAlertas alertas={alertas} />
      </div>

      {alertas.length > 0 ? (
        <ul className="overflow-hidden rounded-[20px] bg-white">
          {alertas.map((a) => (
            <FilaAlerta key={a.id} alerta={a} />
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl bg-white px-4 py-4 text-sm text-tenue">
          No hay alertas todavía.
        </p>
      )}
    </>
  );
}
