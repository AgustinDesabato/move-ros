"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  heartbeat,
  ofertaActual,
  viajeAsignado,
  aceptarOferta,
  rechazarOferta,
  iniciarViaje,
  finalizarViaje,
  confirmarCobro,
  bajarseViaje,
  reportarUbicacion,
  marcarEnLinea,
  type OfertaActiva,
} from "@/app/actions/conductor";
import { getReputacion } from "@/app/actions/viaje";
import { OFERTA_TTL_S, POLL_MS } from "@/lib/despacho";
import {
  distanciaMetros,
  estrellasCorto,
  formatoKm,
  formatoMin,
  formatoPesos,
  metodoPago,
} from "@/lib/formato";
import { ROSARIO_CENTER, type LatLng } from "@/lib/geocode";
import type { Trip, Reputacion } from "@/lib/supabase/types";
import FormCalificacion, {
  ASPECTOS_PASAJERO,
} from "@/app/viajes/form-calificacion";
import { IconoCheck, IconoMenu, IconoPersona, IconoUbicacion } from "@/components/iconos";
import BotonEmergencia from "@/components/boton-emergencia";
import {
  Dato,
  Panel,
  PantallaMapa,
  Recorrido,
  btnFlotante,
  btnPrimario,
  btnSecundario,
  enlaceCls,
  tituloCls,
} from "@/components/ui";

const Mapa = dynamic(() => import("@/app/viajar/mapa"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-mapa" />,
});

// Estado del permiso de geolocalización del navegador. "checking" mientras se
// consulta; "unsupported" si el navegador no expone geolocalización.
type PermisoUbic =
  | "checking"
  | "granted"
  | "denied"
  | "prompt"
  | "unsupported";

function lugares(trip: Trip) {
  return {
    origen: { lat: trip.origen_lat, lng: trip.origen_lng, label: trip.origen_label },
    destino: {
      lat: trip.destino_lat,
      lng: trip.destino_lng,
      label: trip.destino_label,
    },
  };
}

// Cuenta regresiva de la oferta como anillo (P11).
function Cuenta({ restante }: { restante: number }) {
  const C = 2 * Math.PI * 24;
  const fraccion = Math.min(1, restante / OFERTA_TTL_S);
  return (
    <span
      role="timer"
      aria-label={`${restante} segundos para responder`}
      className={`relative flex size-14 shrink-0 items-center justify-center text-base font-bold tabular-nums ${
        restante <= 5 ? "text-peligro" : "text-acento"
      }`}
    >
      <svg viewBox="0 0 56 56" aria-hidden className="absolute inset-0 size-14 -rotate-90">
        <circle cx="28" cy="28" r="24" fill="none" stroke="var(--color-acento-suave)" strokeWidth="5" />
        <circle
          cx="28"
          cy="28"
          r="24"
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${C * fraccion} ${C}`}
        />
      </svg>
      {restante}s
    </span>
  );
}

// Recibo del conductor tras finalizar: el monto bruto del viaje + el estado del
// cobro. Muestra el total (la tarifa completa) por igual sea independiente o de
// remisería; el reparto (comisión de plataforma y retención de la remisería) se
// modela en la capa 2 de remiserías. Transferencia: se da por pagado al finalizar.
// Efectivo: botón "Cobrado" que confirma el pago. Keyeado por trip.id afuera para
// resetear el estado por viaje.
function ReciboConductor({ trip }: { trip: Trip }) {
  const [pendiente, startTransition] = useTransition();
  const [cobrado, setCobrado] = useState(trip.metodo_pago === "digital");

  const confirmar = () =>
    startTransition(async () => {
      await confirmarCobro(trip.id);
      setCobrado(true);
    });

  return (
    <div className="flex flex-col gap-3 rounded-[18px] bg-white p-4.5">
      <div className="flex items-baseline justify-between">
        <span className="text-lg font-bold">Total del viaje</span>
        <span className="font-display text-[32px] font-bold">
          {formatoPesos(trip.tarifa_estimada)}
        </span>
      </div>
      <p className="text-sm text-tenue">
        {metodoPago(trip.metodo_pago)} · {formatoKm(trip.distancia_m)}
      </p>
      {cobrado ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl bg-exito-suave px-3.5 py-2.5 text-sm font-semibold text-exito"
        >
          <IconoCheck className="size-4" />
          {trip.metodo_pago === "digital" ? "Pago por transferencia" : "Cobrado"}
        </p>
      ) : (
        <button type="button" disabled={pendiente} onClick={confirmar} className={btnPrimario}>
          Confirmar cobro en efectivo
        </button>
      )}
    </div>
  );
}

export default function PanelConductor({
  nombre,
  enLineaInicial,
}: {
  nombre: string;
  enLineaInicial: boolean;
}) {
  const [oferta, setOferta] = useState<OfertaActiva | null>(null);
  const [viaje, setViaje] = useState<Trip | null>(null);
  const [cargando, setCargando] = useState(true);
  // Disponible = el panel late (heartbeat) y pide ofertas. Apagado, el despacho
  // deja de elegirlo (SPEC 25: en_linea = false, persistido en profiles).
  // Arranca desde lo que quedó guardado en la base, no siempre encendido.
  const [disponible, setDisponible] = useState(enLineaInicial);
  const [ahora, setAhora] = useState(() => Date.now());
  const [permisoUbic, setPermisoUbic] = useState<PermisoUbic>("checking");
  const [posConductor, setPosConductor] = useState<LatLng | null>(null);
  const [pendiente, startTransition] = useTransition();
  // Al finalizar, viajeAsignado() deja de traer el viaje: guardamos el viaje
  // recién cerrado acá para poder ofrecer el prompt de calificación del pasajero.
  const [viajeParaCalificar, setViajeParaCalificar] = useState<Trip | null>(
    null,
  );

  // Reputación del pasajero de la oferta actual (para decidir aceptar/rechazar).
  const [repPasajero, setRepPasajero] = useState<Reputacion | null>(null);

  // Sólo se comparte ubicación con un viaje asignado; su id decide arrancar/parar
  // el watch (el objeto `viaje` cambia de referencia en cada poll y reiniciaría).
  const viajeId = viaje?.id ?? null;
  const ofertaId = oferta?.trip.id ?? null;
  const pasajeroOferta = oferta?.trip.pasajero_id ?? null;

  // Un ciclo de poll: heartbeat + oferta actual (si está disponible) + viaje
  // asignado (siempre, para no perder un viaje ya aceptado).
  const tick = useCallback(async () => {
    if (disponible) await heartbeat();
    const [o, v] = await Promise.all([
      disponible ? ofertaActual() : Promise.resolve(null),
      viajeAsignado(),
    ]);
    setOferta(o);
    setViaje(v);
    setCargando(false);
  }, [disponible]);

  useEffect(() => {
    // tick() es asíncrono: los setState ocurren tras los await, no hay cascada
    // síncrona. Es el poll inmediato del patrón poll-al-montar + intervalo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [tick]);

  // Reloj de 1s para la cuenta regresiva de la oferta.
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Consulta el permiso de geolocalización y se suscribe a sus cambios. Sin la
  // Permissions API (Safari viejo) queda en "prompt": recién al pedirlo se sabrá.
  useEffect(() => {
    // Feature-detection de una sola vez al montar; el setState síncrono es el
    // patrón poll-al-montar del resto del componente, no una cascada de renders.
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPermisoUbic("unsupported");
      return;
    }
    if (!navigator.permissions?.query) {
      setPermisoUbic("prompt");
      return;
    }
    let status: PermissionStatus | null = null;
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((s) => {
        status = s;
        setPermisoUbic(s.state);
        s.onchange = () => setPermisoUbic(s.state);
      })
      .catch(() => setPermisoUbic("prompt"));
    return () => {
      if (status) status.onchange = null;
    };
  }, []);

  // Emite la posición mientras hay un viaje asignado. watchPosition dispara muchos
  // fixes; los acotamos a POLL_MS antes de escribir en la DB. Se corta (clearWatch)
  // al desmontar o al dejar de haber viaje activo.
  useEffect(() => {
    if (!viajeId || typeof navigator === "undefined" || !navigator.geolocation) {
      return;
    }
    let ultimoEnvio = 0; // fuerza reportar en el primer fix
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        // El marcador del propio conductor sigue cada fix (UI local, sin acotar).
        setPosConductor({ lat: latitude, lng: longitude });
        const t = Date.now();
        if (t - ultimoEnvio < POLL_MS) return;
        ultimoEnvio = t;
        reportarUbicacion(latitude, longitude);
      },
      undefined,
      { enableHighAccuracy: true, maximumAge: 0 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [viajeId]);

  // Cada oferta nueva obliga a compartir un fix fresco: al aparecer una oferta se
  // descarta cualquier ubicación previa. Keyeado a ofertaId (no al estado ocioso),
  // así un getCurrentPosition que resuelve tarde no puede colarse a la oferta
  // siguiente. Durante el viaje (sin oferta) la ubicación se conserva.
  useEffect(() => {
    if (ofertaId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPosConductor(null);
    }
  }, [ofertaId]);

  // Trae la reputación del pasajero de la oferta (reputacion es security definer:
  // sólo devuelve el agregado, sin exponer el perfil). Se limpia sin oferta.
  useEffect(() => {
    if (!pasajeroOferta) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRepPasajero(null);
      return;
    }
    let vigente = true;
    getReputacion(pasajeroOferta).then((r) => {
      if (vigente) setRepPasajero(r);
    });
    return () => {
      vigente = false;
    };
  }, [pasajeroOferta]);

  // El conductor comparte su ubicación en tiempo real para poder aceptar.
  // getCurrentPosition abre el diálogo de permiso (si hace falta) y toma un fix
  // real del GPS; recién con ese fix se habilita Aceptar.
  const compartirUbicacion = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPermisoUbic("granted");
        setPosConductor({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setPermisoUbic("denied");
      },
      { enableHighAccuracy: true, maximumAge: 0 },
    );
  };

  const correr = (accion: () => Promise<void>) =>
    startTransition(async () => {
      await accion();
      await tick();
    });

  // Finaliza y retiene el viaje cerrado para el prompt de calificación (el tick
  // siguiente lo saca de viajeAsignado). "Omitir" pospone; queda en /viajes.
  const finalizar = (trip: Trip) =>
    startTransition(async () => {
      await finalizarViaje(trip.id);
      setViajeParaCalificar(trip);
      await tick();
    });

  // Recibo (total + cobro) y calificación tras finalizar (tienen prioridad sobre
  // ofertas nuevas). Es la única vista sin mapa.
  if (viajeParaCalificar) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-5 pt-14 pb-6">
        <div className="flex flex-col items-center gap-2.5 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-exito-suave text-exito">
            <IconoCheck className="size-7" />
          </span>
          <h1 className={tituloCls}>Viaje finalizado</h1>
        </div>
        <ReciboConductor key={viajeParaCalificar.id} trip={viajeParaCalificar} />
        <h2 className="mt-2 text-center text-lg font-bold">Calificá a tu pasajero</h2>
        <FormCalificacion
          tripId={viajeParaCalificar.id}
          aspectos={ASPECTOS_PASAJERO}
          onCerrar={() => setViajeParaCalificar(null)}
          onListo={() => setViajeParaCalificar(null)}
        />
      </main>
    );
  }

  const activo = viaje ?? oferta?.trip ?? null;
  const { origen, destino } = activo
    ? lugares(activo)
    : { origen: null, destino: null };

  const encabezado = (
    <div className="flex items-center gap-3 rounded-[20px] bg-white py-2 pr-2 pl-2 shadow-[0_8px_24px_rgba(21,23,28,0.12)]">
      <Link
        href="/perfil"
        aria-label="Menú de usuario"
        className={`${btnFlotante} shadow-none`}
      >
        <IconoMenu />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] text-tenue">
          Hola, {nombre.split(" ")[0]}
        </span>
        <span className="font-display text-lg leading-tight font-bold">
          {viaje ? "En viaje" : disponible ? "Disponible" : "No disponible"}
        </span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={disponible || viaje !== null}
        aria-label="Disponible para recibir viajes"
        disabled={viaje !== null}
        onClick={() => {
          const nuevo = !disponible;
          setDisponible(nuevo);
          startTransition(() => {
            marcarEnLinea(nuevo);
          });
        }}
        className="flex h-11 w-16 items-center justify-center disabled:opacity-60"
      >
        <span
          className={`flex h-8 w-14 items-center rounded-full p-[3px] transition-colors ${
            disponible || viaje ? "justify-end bg-exito" : "justify-start bg-borde"
          }`}
        >
          <span className="size-[26px] rounded-full bg-white shadow-sm" />
        </span>
      </button>
    </div>
  );

  const mapa = (
    <Mapa
      center={posConductor ?? origen ?? ROSARIO_CENTER}
      origen={origen}
      destino={destino}
      conductor={posConductor}
      margen={{ arriba: 110, abajo: oferta && !viaje ? 470 : 380 }}
    />
  );

  let contenido: React.ReactNode;

  if (cargando) {
    contenido = (
      <p role="status" className="py-2 text-center text-sm text-tenue">
        Cargando…
      </p>
    );
  } else if (viaje) {
    // Viaje asignado (aceptada / en_curso): tiene prioridad sobre cualquier oferta.
    const enCurso = viaje.estado === "en_curso";
    contenido = (
      <>
        <div className="flex items-baseline justify-between gap-3">
          <h1 className={tituloCls}>{enCurso ? "Viaje en curso" : "Viaje aceptado"}</h1>
          <span className="shrink-0 text-sm text-tenue">
            {enCurso ? "Llevá al pasajero" : "Buscá al pasajero"}
          </span>
        </div>
        <Recorrido origen={viaje.origen_label} destino={viaje.destino_label} />
        <div className="grid grid-cols-3 gap-2">
          <Dato valor={formatoKm(viaje.distancia_m)} etiqueta="Viaje" />
          <Dato valor={formatoPesos(viaje.tarifa_estimada)} etiqueta="Tarifa" destacado />
          <Dato valor={metodoPago(viaje.metodo_pago)} etiqueta="Pago" />
        </div>
        {enCurso ? (
          <button
            type="button"
            disabled={pendiente}
            onClick={() => finalizar(viaje)}
            className={btnPrimario}
          >
            Finalizar viaje
          </button>
        ) : (
          <div className="flex gap-2.5">
            <button
              type="button"
              disabled={pendiente}
              onClick={() => correr(() => bajarseViaje(viaje.id))}
              className={`${btnSecundario} flex-1`}
            >
              Bajarme
            </button>
            <button
              type="button"
              disabled={pendiente}
              onClick={() => correr(() => iniciarViaje(viaje.id))}
              className={`${btnPrimario} flex-[2]`}
            >
              Iniciar viaje
            </button>
          </div>
        )}
        <BotonEmergencia tripId={viaje.id} />
      </>
    );
  } else if (oferta) {
    // P11 · Oferta entrante.
    const restante = Math.max(
      0,
      Math.ceil((new Date(oferta.expira_at).getTime() - ahora) / 1000),
    );
    // Requiere una ubicación en tiempo real ya obtenida (no sólo el permiso).
    const puedeAceptar = posConductor !== null;
    const aOrigen =
      posConductor && origen ? formatoKm(distanciaMetros(posConductor, origen)) : null;
    contenido = (
      <>
        <div className="flex items-center justify-between gap-3">
          <h1 className={tituloCls}>Nueva solicitud</h1>
          <Cuenta restante={restante} />
        </div>
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex size-10 items-center justify-center rounded-full bg-crema text-tenue"
          >
            <IconoPersona />
          </span>
          <span className="flex-1 text-[15px] font-semibold">
            Pasajero{" "}
            {repPasajero && (
              <span className="font-medium text-tenue">· {estrellasCorto(repPasajero)}</span>
            )}
            {pasajeroOferta && (
              <Link
                href={`/usuarios/${pasajeroOferta}`}
                className={`${enlaceCls} ml-2 text-sm`}
              >
                Ver perfil
              </Link>
            )}
          </span>
          {aOrigen && <span className="text-sm text-tenue">a {aOrigen}</span>}
        </div>
        <Recorrido origen={oferta.trip.origen_label} destino={oferta.trip.destino_label} />
        <div className="grid grid-cols-3 gap-2">
          <Dato
            valor={formatoKm(oferta.trip.distancia_m)}
            etiqueta={formatoMin(oferta.trip.duracion_s)}
          />
          <Dato
            valor={formatoPesos(oferta.trip.tarifa_estimada)}
            etiqueta="Tarifa"
            destacado
          />
          <Dato valor={metodoPago(oferta.trip.metodo_pago)} etiqueta="Pago" />
        </div>

        {!puedeAceptar && (
          <div className="flex flex-col gap-2 rounded-[14px] bg-aviso-suave p-3.5 text-sm text-aviso">
            <p>
              <span className="font-bold">Compartí tu ubicación.</span> Para aceptar
              el viaje el pasajero tiene que poder verte en el mapa.
            </p>
            {permisoUbic === "denied" ? (
              <p className="font-semibold">
                Bloqueaste la ubicación. Habilitala en los permisos del navegador
                para poder aceptar.
              </p>
            ) : permisoUbic === "unsupported" ? (
              <p className="font-semibold">Tu navegador no permite compartir ubicación.</p>
            ) : (
              <button
                type="button"
                onClick={compartirUbicacion}
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-aviso font-semibold text-white transition-opacity hover:opacity-90"
              >
                <IconoUbicacion className="size-[18px]" />
                Compartir mi ubicación
              </button>
            )}
          </div>
        )}

        <div className="flex gap-2.5">
          <button
            type="button"
            disabled={pendiente}
            onClick={() => correr(() => rechazarOferta(oferta.trip.id))}
            className={`${btnSecundario} flex-1`}
          >
            Rechazar
          </button>
          <button
            type="button"
            disabled={pendiente || restante === 0 || !puedeAceptar}
            onClick={() => correr(() => aceptarOferta(oferta.trip.id))}
            className={`${btnPrimario} flex-[2]`}
          >
            Aceptar
          </button>
        </div>
      </>
    );
  } else {
    // Sin oferta ni viaje asignado.
    contenido = (
      <div className="flex items-center gap-3.5 py-1">
        <span aria-hidden className="relative flex size-3 shrink-0">
          {disponible && (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-exito opacity-60" />
          )}
          <span
            className={`relative inline-flex size-3 rounded-full ${disponible ? "bg-exito" : "bg-borde"}`}
          />
        </span>
        <div>
          <p className="font-bold">
            {disponible ? "Esperando viajes…" : "No estás recibiendo viajes"}
          </p>
          <p className="text-sm text-tenue">
            {disponible
              ? "Mantené esta pantalla abierta para recibir ofertas."
              : "Activá el interruptor para volver a estar disponible."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <PantallaMapa mapa={mapa} arriba={encabezado}>
      <Panel>{contenido}</Panel>
    </PantallaMapa>
  );
}
