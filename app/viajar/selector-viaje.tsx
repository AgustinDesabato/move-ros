"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import BuscadorDireccion from "./buscador-direccion";
import {
  ROSARIO_CENTER,
  reverseGeocode,
  type LatLng,
  type Place,
} from "@/lib/geocode";
import { obtenerRuta, type Ruta } from "@/lib/ruteo";
import { calcularTarifa } from "@/lib/tarifa";
import { formatoKm, formatoMin, formatoPesos } from "@/lib/formato";
import { solicitarViaje } from "@/app/actions/viaje";
import type { MetodoPago } from "@/lib/supabase/types";
import {
  IconoBillete,
  IconoMenu,
  IconoTarjeta,
  IconoUbicacion,
  IconoVolver,
} from "@/components/iconos";
import {
  Avatar,
  Dato,
  MensajeError,
  Panel,
  PantallaMapa,
  Recorrido,
  Segmentado,
  btnFlotante,
  btnPrimario,
  tituloCls,
} from "@/components/ui";

const Mapa = dynamic(() => import("./mapa"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-mapa" />,
});

// P04 (elegir origen y destino) y P05 (confirmar viaje) sobre el mismo mapa: con
// origen y destino elegidos el panel pasa a mostrar ruta, tarifa y medio de pago.
export default function SelectorViaje({ nombre }: { nombre: string }) {
  const [origen, setOrigen] = useState<Place | null>(null);
  const [destino, setDestino] = useState<Place | null>(null);
  const [center, setCenter] = useState<LatLng>(ROSARIO_CENTER);
  const [ubicando, setUbicando] = useState(false);
  // Guardamos el resultado junto a la "firma" del par al que pertenece, para
  // saber si sigue vigente cuando cambian origen/destino (y evitar setState
  // sincrónico dentro del efecto).
  const [res, setRes] = useState<{ sig: string; ruta: Ruta | null } | null>(
    null,
  );

  // Toma la posición del GPS como origen. `pisar` decide si reemplaza un origen
  // ya elegido (botón de ubicación) o sólo completa uno vacío (al abrir).
  function usarUbicacion(pisar: boolean) {
    if (!navigator.geolocation) return;
    setUbicando(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setCenter({ lat, lng });
        const p = (await reverseGeocode(lat, lng)) ?? {
          lat,
          lng,
          label: "Mi ubicación actual",
        };
        setOrigen((prev) => (pisar || !prev ? p : prev));
        setUbicando(false);
      },
      () => {
        // Permiso negado o error: el origen se elige a mano.
        setUbicando(false);
      },
    );
  }

  useEffect(() => {
    // Origen por GPS al abrir, como pide P04. El setState ocurre en el callback
    // asíncrono de la geolocalización, no durante el efecto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    usarUbicacion(false);
  }, []);

  const sig =
    origen && destino
      ? `${origen.lat},${origen.lng}|${destino.lat},${destino.lng}`
      : null;

  // Cuando hay origen y destino, pide la ruta al proxy /api/ruteo.
  useEffect(() => {
    if (!sig || !origen || !destino) return;
    let cancelado = false;
    obtenerRuta(origen, destino).then((r) => {
      if (!cancelado) setRes({ sig, ruta: r });
    });
    return () => {
      cancelado = true;
    };
  }, [sig, origen, destino]);

  const vigente = res && res.sig === sig ? res : null;
  const ruta = vigente?.ruta ?? null;
  const errorRuta = vigente !== null && vigente.ruta === null;
  const cargandoRuta = sig !== null && vigente === null;
  const tarifa = ruta ? calcularTarifa(ruta.distanciaM, ruta.duracionS) : null;

  const [metodo, setMetodo] = useState<MetodoPago>("efectivo");
  const [enviando, startEnvio] = useTransition();
  const [errorSolicitud, setErrorSolicitud] = useState<string | null>(null);

  function onSolicitar() {
    if (!origen || !destino) return;
    setErrorSolicitud(null);
    startEnvio(async () => {
      // En éxito, la action redirige a /viajar (con la solicitud pendiente).
      const res = await solicitarViaje(origen, destino, metodo);
      if (res?.error) setErrorSolicitud(res.error);
    });
  }

  const confirmando = origen !== null && destino !== null;

  const mapa = (
    <Mapa
      center={center}
      origen={origen}
      destino={destino}
      ruta={ruta?.puntos}
      margen={{ arriba: 90, abajo: confirmando ? 480 : 330 }}
    />
  );

  // P05 · Confirmar viaje.
  if (confirmando) {
    return (
      <PantallaMapa
        mapa={mapa}
        arriba={
          <div className="flex">
            <button
              type="button"
              onClick={() => setDestino(null)}
              aria-label="Cambiar destino"
              className={btnFlotante}
            >
              <IconoVolver />
            </button>
          </div>
        }
      >
        <Panel>
          <h1 className={tituloCls}>Confirmar viaje</h1>
          <Recorrido origen={origen.label} destino={destino.label} />

          {cargandoRuta && (
            <p role="status" className="text-sm text-tenue">
              Calculando ruta…
            </p>
          )}
          {errorRuta && (
            <MensajeError>
              No pudimos calcular la ruta. Probá de nuevo en un momento.
            </MensajeError>
          )}
          {ruta && tarifa !== null && (
            <div className="grid grid-cols-3 gap-2">
              <Dato valor={formatoKm(ruta.distanciaM)} etiqueta="Distancia" />
              <Dato valor={formatoMin(ruta.duracionS)} etiqueta="Duración" />
              <Dato valor={formatoPesos(tarifa)} etiqueta="Tarifa estimada" destacado />
            </div>
          )}

          <Segmentado
            name="metodo"
            etiqueta="Medio de pago"
            value={metodo}
            onChange={setMetodo}
            opciones={[
              { valor: "efectivo", texto: "Efectivo", icono: <IconoBillete /> },
              { valor: "digital", texto: "Digital", icono: <IconoTarjeta /> },
            ]}
          />

          <p className="text-center text-[13px] text-tenue">
            La tarifa final se calcula en el servidor al confirmar.
          </p>

          {errorSolicitud && <MensajeError>{errorSolicitud}</MensajeError>}

          <button
            type="button"
            onClick={onSolicitar}
            disabled={cargandoRuta || errorRuta || !ruta || enviando}
            className={btnPrimario}
          >
            {enviando ? "Solicitando…" : "Confirmar viaje"}
          </button>
        </Panel>
      </PantallaMapa>
    );
  }

  // P04 · Inicio con mapa.
  return (
    <PantallaMapa
      mapa={mapa}
      arriba={
        <div className="flex items-center justify-between gap-3">
          <Link href="/perfil" aria-label="Menú de usuario" className={btnFlotante}>
            <IconoMenu />
          </Link>
          <p className="flex h-12 min-w-0 items-center gap-2.5 rounded-full bg-white py-0 pr-4 pl-1.5 text-[15px] font-semibold shadow-[0_4px_14px_rgba(21,23,28,0.14)]">
            <Avatar nombre={nombre} className="size-9 text-[13px]" />
            <span className="truncate">Hola, {nombre.split(" ")[0]}</span>
          </p>
        </div>
      }
    >
      <div className="flex justify-end px-4 pb-3">
        <button
          type="button"
          onClick={() => usarUbicacion(true)}
          disabled={ubicando}
          aria-label="Usar mi ubicación actual como origen"
          className={`${btnFlotante} rounded-full text-acento disabled:opacity-60`}
        >
          <IconoUbicacion className={`size-[22px] ${ubicando ? "animate-pulse" : ""}`} />
        </button>
      </div>
      <Panel>
        <h1 className={`${tituloCls} mt-1`}>¿A dónde vas?</h1>
        <BuscadorDireccion
          key={`o-${origen?.label ?? ""}`}
          etiqueta="Origen"
          marcador="origen"
          placeholder={ubicando ? "Buscando tu ubicación…" : "¿Desde dónde salís?"}
          valorInicial={origen?.label}
          onSelect={setOrigen}
        />
        <BuscadorDireccion
          key={`d-${destino?.label ?? ""}`}
          etiqueta="Destino"
          marcador="destino"
          placeholder="Ingresá tu destino"
          valorInicial={destino?.label}
          onSelect={setDestino}
        />
      </Panel>
    </PantallaMapa>
  );
}
