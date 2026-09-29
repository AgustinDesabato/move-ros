"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  estadoViajeActivo,
  cancelarViaje,
  type EstadoViaje,
} from "@/app/actions/viaje";
import { POLL_MS } from "@/lib/despacho";
import {
  estrellasCorto,
  formatoKm,
  formatoMin,
  formatoPesos,
  metodoPago,
} from "@/lib/formato";
import type { LatLng } from "@/lib/geocode";
import type { Trip, ConductorPublico, TripStatus } from "@/lib/supabase/types";
import FormCalificacion, {
  ASPECTOS_CONDUCTOR,
} from "@/app/viajes/form-calificacion";
import {
  IconoAlerta,
  IconoBillete,
  IconoCheck,
  IconoCompartir,
  IconoTarjeta,
} from "@/components/iconos";
import {
  Avatar,
  Panel,
  PantallaMapa,
  Recorrido,
  btnPrimario,
  btnSecundario,
  seccionCls,
  tituloCls,
} from "@/components/ui";

const Mapa = dynamic(() => import("./mapa"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-mapa" />,
});

// Aceptado → En curso → Finalizado (P07, arriba del mapa).
function Progreso({ estado }: { estado: TripStatus }) {
  const pasos = ["Aceptado", "En curso", "Finalizado"];
  const actual = estado === "aceptada" ? 0 : estado === "en_curso" ? 1 : 2;
  return (
    <ol
      aria-label="Estado del viaje"
      className="flex h-13 items-center rounded-full bg-white px-4.5 text-sm shadow-[0_4px_14px_rgba(21,23,28,0.14)]"
    >
      {pasos.map((p, i) => (
        <li
          key={p}
          aria-current={i === actual ? "step" : undefined}
          className={`flex items-center gap-2 ${i > 0 ? "flex-1 pl-2" : ""}`}
        >
          {i > 0 && (
            <span
              aria-hidden
              className={`h-[3px] flex-1 rounded-full ${i <= actual ? "bg-acento" : "bg-borde"}`}
            />
          )}
          <span
            className={`flex items-center gap-1.5 whitespace-nowrap ${
              i < actual
                ? "font-semibold text-exito"
                : i === actual
                  ? "font-bold text-acento"
                  : "text-tenue"
            }`}
          >
            {i < actual && <IconoCheck className="size-4" />}
            {p}
          </span>
        </li>
      ))}
    </ol>
  );
}

function TarjetaConductor({ conductor }: { conductor: ConductorPublico }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-linea p-3.5">
      <Avatar nombre={conductor.nombre} className="size-13 text-[17px]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-bold">
          {conductor.nombre ?? "Tu conductor"}{" "}
          <span className="font-medium text-tenue">
            {estrellasCorto({
              promedio: conductor.promedio_estrellas,
              cantidad: conductor.cantidad_calificaciones,
            })}
          </span>
        </p>
        <p className="truncate text-sm text-tenue">
          {conductor.marca} {conductor.modelo} · {conductor.color}
        </p>
      </div>
      <span className="shrink-0 rounded-lg border-2 border-tinta px-2 py-1.5 font-mono text-sm font-bold tracking-[0.06em]">
        <span className="sr-only">Patente </span>
        {conductor.patente}
      </span>
    </div>
  );
}

// Comparte el viaje con un contacto (hoja de compartir del sistema o, si el
// navegador no la tiene, copia el texto al portapapeles).
function BotonCompartir({
  trip,
  conductor,
}: {
  trip: Trip;
  conductor: ConductorPublico | null;
}) {
  const [copiado, setCopiado] = useState(false);

  const compartir = async () => {
    const auto = conductor
      ? ` Conductor: ${conductor.nombre ?? "sin nombre"}, ${conductor.marca} ${conductor.modelo} ${conductor.color}, patente ${conductor.patente}.`
      : "";
    const texto = `Estoy viajando con Move Ros de ${trip.origen_label} a ${trip.destino_label}.${auto}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Mi viaje en Move Ros", text: texto });
      } catch {
        // El usuario cerró la hoja de compartir: nada que hacer.
      }
      return;
    }
    await navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  return (
    <button type="button" onClick={compartir} className={`${btnSecundario} h-13`}>
      <IconoCompartir />
      <span aria-live="polite">{copiado ? "Copiado" : "Compartir viaje"}</span>
    </button>
  );
}

// P08 adaptada: el pasajero ve el importe y el medio de pago que eligió. El
// cobro en efectivo lo confirma el conductor; el digital se liquida solo.
function Recibo({ trip, onContinuar }: { trip: Trip; onContinuar: () => void }) {
  const digital = trip.metodo_pago === "digital";
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-5 pt-14 pb-8">
      <div className="flex flex-col items-center gap-2.5 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-exito-suave text-exito">
          <IconoCheck className="size-7" />
        </span>
        <h1 className={tituloCls}>Viaje finalizado</h1>
        <p className="text-sm text-tenue">
          {trip.origen_label} → {trip.destino_label}
        </p>
      </div>

      <dl className="flex flex-col gap-2.5 rounded-[18px] bg-white p-4.5">
        <div className="flex justify-between text-[15px]">
          <dt className="text-tinta-suave">Tarifa del viaje</dt>
          <dd>{formatoPesos(trip.tarifa_estimada)}</dd>
        </div>
        <div className="flex justify-between text-[15px]">
          <dt className="text-tinta-suave">Recorrido</dt>
          <dd>
            {formatoKm(trip.distancia_m)} · {formatoMin(trip.duracion_s)}
          </dd>
        </div>
        <div aria-hidden className="my-1 h-px bg-linea" />
        <div className="flex items-baseline justify-between">
          <dt className="text-lg font-bold">Total</dt>
          <dd className="font-display text-[32px] font-bold">
            {formatoPesos(trip.tarifa_estimada)}
          </dd>
        </div>
      </dl>

      <p className={`${seccionCls} mt-1`}>Medio de pago</p>
      <div className="flex min-h-15 items-center gap-3.5 rounded-2xl border-2 border-acento bg-white px-4">
        <span className="text-acento">{digital ? <IconoTarjeta /> : <IconoBillete />}</span>
        <span className="flex-1 text-base font-bold">{metodoPago(trip.metodo_pago)}</span>
        <span className="text-[13px] text-tenue">
          {digital ? "Pago acreditado" : "Se abona al conductor"}
        </span>
      </div>

      <button type="button" onClick={onContinuar} className={`${btnPrimario} mt-auto`}>
        Continuar
      </button>
    </main>
  );
}

// P09 · Calificación del conductor.
function Calificar({
  trip,
  conductor,
  onTerminar,
}: {
  trip: Trip;
  conductor: ConductorPublico | null;
  onTerminar: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-5 pt-14 pb-6">
      <h1 className={`${tituloCls} text-center`}>Calificá tu viaje</h1>
      <div className="flex flex-col items-center gap-1.5 pt-2 text-center">
        <Avatar nombre={conductor?.nombre} className="size-22 text-[28px]" />
        <p className="mt-1.5 text-lg font-bold">{conductor?.nombre ?? "Tu conductor"}</p>
        {conductor && (
          <p className="text-sm text-tenue">
            {conductor.marca} {conductor.modelo} · {conductor.patente}
          </p>
        )}
      </div>
      <FormCalificacion
        tripId={trip.id}
        aspectos={ASPECTOS_CONDUCTOR}
        onCerrar={onTerminar}
        onListo={onTerminar}
      />
    </main>
  );
}

export default function ViajePendiente({ initialTrip }: { initialTrip: Trip }) {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoViaje>({
    trip: initialTrip,
    conductor: null,
  });
  const [pendiente, startTransition] = useTransition();
  // Al finalizar: primero el recibo, después la calificación. Si se omite, el
  // viaje queda calificable desde /viajes.
  const [paso, setPaso] = useState<"recibo" | "calificar">("recibo");

  const tick = useCallback(async () => {
    const e = await estadoViajeActivo(initialTrip.id);
    if (!e) {
      // El viaje ya no está activo (p. ej. cancelado): volvé a la vista base.
      router.refresh();
      return;
    }
    setEstado(e);
  }, [router, initialTrip.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [tick]);

  if (!estado) return null;
  const { trip, conductor } = estado;

  const volver = () => router.refresh();

  if (trip.estado === "finalizada") {
    return paso === "recibo" ? (
      <Recibo trip={trip} onContinuar={() => setPaso("calificar")} />
    ) : (
      <Calificar trip={trip} conductor={conductor} onTerminar={volver} />
    );
  }

  const buscando = trip.estado === "pendiente";
  const origen = {
    lat: trip.origen_lat,
    lng: trip.origen_lng,
    label: trip.origen_label,
  };
  const destino = {
    lat: trip.destino_lat,
    lng: trip.destino_lng,
    label: trip.destino_label,
  };
  // Posición del conductor sólo si el servidor la marca vigente (posición reciente)
  // y hay coords; si no, no hay marcador y se muestra "Ubicando al conductor…".
  const posConductor: LatLng | null =
    conductor &&
    conductor.ubic_vigente &&
    conductor.ubic_lat != null &&
    conductor.ubic_lng != null
      ? { lat: conductor.ubic_lat, lng: conductor.ubic_lng }
      : null;

  const cancelar = () =>
    startTransition(async () => {
      await cancelarViaje(trip.id);
      router.refresh();
    });

  const mapa = (
    <Mapa
      center={posConductor ?? origen}
      origen={origen}
      destino={buscando ? null : destino}
      conductor={posConductor}
      buscando={buscando}
      margen={{ arriba: buscando ? 60 : 90, abajo: 440 }}
    />
  );

  // P06 · Búsqueda de conductor.
  if (buscando) {
    return (
      <PantallaMapa mapa={mapa}>
        <Panel>
          <div className="flex flex-col gap-1.5 text-center">
            <h1 className={tituloCls}>Buscando conductor…</h1>
            <p className="text-[15px] text-tenue">
              Ofreciendo tu viaje a conductores cercanos
            </p>
          </div>
          <div
            role="progressbar"
            aria-label="Buscando conductor"
            className="relative h-1.5 overflow-hidden rounded-full bg-acento-suave"
          >
            <span className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-acento motion-safe:animate-[barrido_1.6s_ease-in-out_infinite]" />
          </div>
          <div className="flex flex-col gap-3 rounded-2xl border border-linea p-1.5">
            <Recorrido
              origen={trip.origen_label}
              destino={trip.destino_label}
              className="bg-transparent"
            />
            <div className="flex items-center justify-between border-t border-linea px-3.5 pt-3 pb-2">
              <span className="text-[15px] text-tenue">
                Tarifa estimada · {metodoPago(trip.metodo_pago)}
              </span>
              <span className="text-lg font-bold">
                {formatoPesos(trip.tarifa_estimada)}
              </span>
            </div>
          </div>
          <button
            type="button"
            disabled={pendiente}
            onClick={cancelar}
            className={`${btnSecundario} text-peligro`}
          >
            Cancelar solicitud
          </button>
        </Panel>
      </PantallaMapa>
    );
  }

  // P07 · Viaje en curso (aceptada / en_curso).
  const enCamino = trip.estado === "aceptada";
  return (
    <PantallaMapa mapa={mapa} arriba={<Progreso estado={trip.estado} />}>
      <Panel>
        <div className="flex items-baseline justify-between gap-3">
          <h1 className={tituloCls}>
            {enCamino ? "Tu conductor está en camino" : "Viaje en curso"}
          </h1>
          <span className="shrink-0 text-sm text-tenue">
            {formatoKm(trip.distancia_m)}
          </span>
        </div>

        {!posConductor && (
          <p role="status" className="-mt-2 text-sm text-tenue">
            Ubicando al conductor…
          </p>
        )}

        {conductor && <TarjetaConductor conductor={conductor} />}

        <BotonCompartir trip={trip} conductor={conductor} />

        <a
          href="tel:911"
          className="flex h-13 items-center justify-center gap-2 rounded-2xl border-2 border-peligro bg-peligro-suave text-base font-bold tracking-[0.02em] text-peligro transition-colors hover:bg-peligro hover:text-white"
        >
          <IconoAlerta />
          Emergencia · llamar al 911
        </a>

        {enCamino && (
          <button
            type="button"
            disabled={pendiente}
            onClick={cancelar}
            className="h-11 text-[15px] font-semibold text-tinta-suave underline-offset-2 hover:underline disabled:opacity-50"
          >
            Cancelar viaje
          </button>
        )}
      </Panel>
    </PantallaMapa>
  );
}
