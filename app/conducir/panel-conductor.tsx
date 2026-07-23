"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import {
  heartbeat,
  ofertaActual,
  viajeAsignado,
  aceptarOferta,
  rechazarOferta,
  iniciarViaje,
  finalizarViaje,
  bajarseViaje,
  reportarUbicacion,
  type OfertaActiva,
} from "@/app/actions/conductor";
import { getReputacion } from "@/app/actions/viaje";
import { POLL_MS } from "@/lib/despacho";
import { estrellas } from "@/lib/formato";
import type { LatLng } from "@/lib/geocode";
import type { Trip, Reputacion } from "@/lib/supabase/types";
import FormCalificacion from "@/app/viajes/form-calificacion";

const Mapa = dynamic(() => import("@/app/viajar/mapa"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full animate-pulse bg-black/5 dark:bg-white/5" />
  ),
});

// Estado del permiso de geolocalización del navegador. "checking" mientras se
// consulta; "unsupported" si el navegador no expone geolocalización.
type PermisoUbic =
  | "checking"
  | "granted"
  | "denied"
  | "prompt"
  | "unsupported";

const primaryCls =
  "w-full rounded-full bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50";
const outlineCls =
  "w-full rounded-full border border-black/15 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10";

function DatosViaje({ trip }: { trip: Trip }) {
  return (
    <dl className="mt-4 flex flex-col gap-3 text-sm">
      <div>
        <dt className="text-xs text-zinc-500 dark:text-zinc-400">Origen</dt>
        <dd className="font-medium">{trip.origen_label}</dd>
      </div>
      <div>
        <dt className="text-xs text-zinc-500 dark:text-zinc-400">Destino</dt>
        <dd className="font-medium">{trip.destino_label}</dd>
      </div>
      <div className="flex items-center justify-between border-t border-black/10 pt-3 dark:border-white/15">
        <span className="text-zinc-500 dark:text-zinc-400">
          {(trip.distancia_m / 1000).toFixed(1)} km ·{" "}
          {Math.round(trip.duracion_s / 60)} min
        </span>
        <span className="text-lg font-semibold">
          ${trip.tarifa_estimada.toLocaleString("es-AR")}
        </span>
      </div>
    </dl>
  );
}

export default function PanelConductor() {
  const [oferta, setOferta] = useState<OfertaActiva | null>(null);
  const [viaje, setViaje] = useState<Trip | null>(null);
  const [cargando, setCargando] = useState(true);
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

  // Un ciclo de poll: heartbeat + oferta actual + viaje asignado.
  const tick = useCallback(async () => {
    await heartbeat();
    const [o, v] = await Promise.all([ofertaActual(), viajeAsignado()]);
    setOferta(o);
    setViaje(v);
    setCargando(false);
  }, []);

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
  // siguiente lo saca de viajeAsignado). La ✕ pospone; queda en /viajes.
  const finalizar = (trip: Trip) =>
    startTransition(async () => {
      await finalizarViaje(trip.id);
      setViajeParaCalificar(trip);
      await tick();
    });

  if (cargando) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Cargando…</p>
    );
  }

  // Prompt de calificación tras finalizar (tiene prioridad sobre ofertas nuevas).
  if (viajeParaCalificar) {
    return (
      <div className="flex w-full max-w-md flex-col gap-4">
        <FormCalificacion
          tripId={viajeParaCalificar.id}
          contraparte="tu pasajero"
          onCerrar={() => setViajeParaCalificar(null)}
          onListo={() => setViajeParaCalificar(null)}
        />
      </div>
    );
  }

  // Viaje asignado (aceptada / en_curso): tiene prioridad sobre cualquier oferta.
  if (viaje) {
    const enCurso = viaje.estado === "en_curso";
    const origen = {
      lat: viaje.origen_lat,
      lng: viaje.origen_lng,
      label: viaje.origen_label,
    };
    const destino = {
      lat: viaje.destino_lat,
      lng: viaje.destino_lng,
      label: viaje.destino_label,
    };
    return (
      <div className="flex w-full max-w-md flex-col gap-4">
        <div className="rounded-2xl border border-black/10 p-5 dark:border-white/15">
          <p className="text-sm font-medium">
            {enCurso ? "Viaje en curso" : "Viaje aceptado"}
          </p>
          <DatosViaje trip={viaje} />
        </div>

        <div className="isolate h-64 overflow-hidden rounded-2xl border border-black/10 dark:border-white/15">
          <Mapa
            center={posConductor ?? origen}
            origen={origen}
            destino={destino}
            conductor={posConductor}
          />
        </div>

        {enCurso ? (
          <button
            type="button"
            disabled={pendiente}
            onClick={() => finalizar(viaje)}
            className={primaryCls}
          >
            Finalizar viaje
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={pendiente}
              onClick={() => correr(() => iniciarViaje(viaje.id))}
              className={primaryCls}
            >
              Iniciar viaje
            </button>
            <button
              type="button"
              disabled={pendiente}
              onClick={() => correr(() => bajarseViaje(viaje.id))}
              className={outlineCls}
            >
              Bajarme
            </button>
          </>
        )}
      </div>
    );
  }

  // Oferta entrante.
  if (oferta) {
    const restante = Math.max(
      0,
      Math.ceil((new Date(oferta.expira_at).getTime() - ahora) / 1000),
    );
    // Requiere una ubicación en tiempo real ya obtenida (no sólo el permiso).
    const puedeAceptar = posConductor !== null;
    return (
      <div className="flex w-full max-w-md flex-col gap-4">
        <div className="rounded-2xl border border-blue-500/40 bg-blue-500/5 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Nuevo viaje para vos</p>
            <span className="text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
              {restante}s
            </span>
          </div>
          {repPasajero && (
            <p className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-500">
              Pasajero · {estrellas(repPasajero)}
            </p>
          )}
          <DatosViaje trip={oferta.trip} />
        </div>

        {!puedeAceptar && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            <p className="font-medium">Compartí tu ubicación</p>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Para aceptar el viaje tenés que compartir tu ubicación en tiempo
              real con el pasajero.
            </p>
            {permisoUbic === "denied" ? (
              <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                Bloqueaste la ubicación. Habilitala en los permisos del
                navegador para poder aceptar.
              </p>
            ) : permisoUbic === "unsupported" ? (
              <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                Tu navegador no permite compartir ubicación.
              </p>
            ) : (
              <button
                type="button"
                onClick={compartirUbicacion}
                className="mt-2 rounded-full bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-700"
              >
                Compartir mi ubicación
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          disabled={pendiente || restante === 0 || !puedeAceptar}
          onClick={() => correr(() => aceptarOferta(oferta.trip.id))}
          className={primaryCls}
        >
          Aceptar
        </button>
        <button
          type="button"
          disabled={pendiente}
          onClick={() => correr(() => rechazarOferta(oferta.trip.id))}
          className={outlineCls}
        >
          Rechazar
        </button>
      </div>
    );
  }

  // Sin oferta ni viaje asignado.
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-2 rounded-2xl border border-black/10 p-8 text-center dark:border-white/15">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
      </span>
      <p className="text-sm font-medium">Esperando viajes…</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Mantené esta pantalla abierta para recibir ofertas.
      </p>
    </div>
  );
}
