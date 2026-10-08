import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  fechaCorta,
  formatoKm,
  formatoMin,
  formatoPesos,
  metodoPago,
} from "@/lib/formato";
import type { ViajeDetalle } from "@/lib/supabase/types";
import { BarraSuperior, Dato, Recorrido, enlaceCls, seccionCls } from "@/components/ui";
import MapaRecorrido from "./mapa-recorrido";
import CalificacionDetalle from "./calificacion-detalle";

// Badge de estado del viaje cerrado, igual que en la fila del historial.
function Estado({ finalizada }: { finalizada: boolean }) {
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

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-[20px] bg-white p-4">
      <h2 className={seccionCls}>{titulo}</h2>
      {children}
    </section>
  );
}

function Monto({
  etiqueta,
  valor,
  nota,
  destacado = false,
}: {
  etiqueta: string;
  valor: string;
  nota?: string;
  destacado?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="flex min-w-0 flex-col text-[15px] text-tinta-suave">
        {etiqueta}
        {nota && <span className="text-[13px] text-tenue">{nota}</span>}
      </dt>
      <dd
        className={
          destacado
            ? "shrink-0 font-display text-xl font-bold"
            : "shrink-0 text-[15px] font-semibold"
        }
      >
        {valor}
      </dd>
    </div>
  );
}

// Spec 28 · Detalle de un viaje cerrado: mapa del recorrido, montos según el
// rol y la calificación que dio quien mira. Sólo para el pasajero o el
// conductor de ese viaje (lo acota la RPC detalle_viaje).
export default async function DetalleViajePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Sin fila: el viaje no existe, es ajeno o el id no es un uuid (la RPC da
  // error). En los tres casos, "no encontrado".
  const { data } = await supabase.rpc("detalle_viaje", { p_trip_id: id });
  const viaje = (data as ViajeDetalle[] | null)?.[0];
  if (!viaje) notFound();

  // Un viaje todavía activo se ve en su pantalla de siempre.
  if (viaje.estado !== "finalizada" && viaje.estado !== "cancelada") {
    redirect(viaje.soy_conductor ? "/conducir" : "/viajar");
  }

  const finalizada = viaje.estado === "finalizada";
  const contraparte =
    viaje.contraparte ?? (viaje.soy_conductor ? "Sin pasajero" : "Sin conductor");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <BarraSuperior titulo="Detalle del viaje" volverHref="/viajes" />

      <div className="flex flex-1 flex-col gap-3 px-5 pt-2 pb-8">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-tenue">
            {fechaCorta(viaje.cerrado_at ?? viaje.created_at)}
          </span>
          <Estado finalizada={finalizada} />
        </div>

        <MapaRecorrido
          origenLat={viaje.origen_lat}
          origenLng={viaje.origen_lng}
          origenLabel={viaje.origen_label}
          destinoLat={viaje.destino_lat}
          destinoLng={viaje.destino_lng}
          destinoLabel={viaje.destino_label}
        />

        <Seccion titulo="Recorrido">
          <Recorrido origen={viaje.origen_label} destino={viaje.destino_label} />
          <div className="grid grid-cols-2 gap-2">
            <Dato valor={formatoKm(viaje.distancia_m)} etiqueta="Distancia" />
            <Dato valor={formatoMin(viaje.duracion_s)} etiqueta="Duración estimada" />
          </div>
          <p className="text-[13px] text-tenue">
            {viaje.soy_conductor ? "Pasajero" : "Conductor"}
            {viaje.contraparte_id ? (
              <Link
                href={`/usuarios/${viaje.contraparte_id}`}
                className={`${enlaceCls} block truncate text-[15px]`}
              >
                {contraparte}
              </Link>
            ) : (
              <span className="block truncate text-[15px] font-semibold text-tinta">
                {contraparte}
              </span>
            )}
          </p>
        </Seccion>

        <Seccion titulo="Montos">
          {finalizada ? (
            <dl className="flex flex-col gap-2.5">
              <Monto
                etiqueta="Total"
                valor={formatoPesos(viaje.pago_monto ?? viaje.tarifa_estimada)}
                destacado
              />
              <Monto etiqueta="Medio de pago" valor={metodoPago(viaje.metodo_pago)} />
              {viaje.pago_estado === null ? (
                <Monto etiqueta="Pago" valor="Sin registro de pago" />
              ) : (
                <Monto
                  etiqueta="Pago"
                  valor={viaje.pago_estado === "pagado" ? "Pagado" : "Pendiente"}
                />
              )}
              {viaje.pago_comision !== null && (
                <Monto
                  etiqueta="Comisión de la plataforma"
                  valor={`− ${formatoPesos(viaje.pago_comision)}`}
                />
              )}
              {viaje.pago_neto !== null && (
                <Monto
                  etiqueta="Neto"
                  nota={viaje.pago_a_empresa ? "Lo cobra tu remisería" : undefined}
                  valor={formatoPesos(viaje.pago_neto)}
                />
              )}
            </dl>
          ) : (
            <>
              <dl>
                <Monto
                  etiqueta="Tarifa estimada"
                  valor={formatoPesos(viaje.tarifa_estimada)}
                  destacado
                />
              </dl>
              <p className="text-[13px] text-tenue">Viaje cancelado: no se cobró.</p>
            </>
          )}
        </Seccion>

        {finalizada && (
          <Seccion titulo="Tu calificación">
            <CalificacionDetalle
              tripId={viaje.id}
              contraparte={contraparte}
              soyConductor={viaje.soy_conductor}
              estrellas={viaje.mi_estrellas}
              comentario={viaje.mi_comentario}
            />
          </Seccion>
        )}
      </div>
    </main>
  );
}
