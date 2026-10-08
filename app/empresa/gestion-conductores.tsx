"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  invitarConductor,
  quitarConductor,
  getViajesConductor,
  cancelarInvitacion,
} from "@/app/actions/empresa";
import { fechaCorta, formatoKm, formatoPesos, iniciales } from "@/lib/formato";
import type {
  EstadisticaConductor,
  InvitacionPendiente,
  ViajeConductor,
} from "@/lib/supabase/types";
import { IconoChevron, IconoMas } from "@/components/iconos";
import {
  Avatar,
  MensajeError,
  btnPrimario,
  btnSecundario,
  enlaceCls,
  etiquetaCls,
  inputCls,
  seccionCls,
} from "@/components/ui";

const btnChico =
  "h-9 shrink-0 rounded-full border-[1.5px] border-borde px-3.5 text-[13px] font-semibold transition-colors hover:bg-crema disabled:opacity-50";

// Badge de estado de un viaje cerrado (mismo criterio que el historial /viajes).
function Estado({ estado }: { estado: ViajeConductor["estado"] }) {
  const finalizada = estado === "finalizada";
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        finalizada ? "bg-exito-suave text-exito" : "bg-crema-oscuro text-tenue"
      }`}
    >
      {finalizada ? "Finalizado" : "Cancelado"}
    </span>
  );
}

// Fila de un conductor: nombre, email y viajes del período; al abrirla muestra
// las cifras del período, sus últimos viajes cerrados para la remisería y el
// botón "Quitar". Un ex conductor (en_flota = false) muestra sus cifras y los
// viajes que hizo para la remisería, pero ya no se lo puede quitar.
function FilaConductor({ conductor }: { conductor: EstadisticaConductor }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [viajes, setViajes] = useState<ViajeConductor[] | null>(null);
  const [cargando, startCarga] = useTransition();

  const quitar = () =>
    startTransition(async () => {
      setError(null);
      const res = await quitarConductor(conductor.id);
      if (res?.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });

  // Carga perezosa: la primera vez trae los viajes; después sólo alterna.
  const alternar = () => {
    if (abierto) {
      setAbierto(false);
      return;
    }
    if (viajes) {
      setAbierto(true);
      return;
    }
    startCarga(async () => {
      setViajes(await getViajesConductor(conductor.id));
      setAbierto(true);
    });
  };

  return (
    <li className="border-b border-linea last:border-b-0">
      <button
        type="button"
        onClick={alternar}
        aria-expanded={abierto}
        disabled={cargando}
        className="flex min-h-17 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-crema/60 disabled:opacity-60"
      >
        <Avatar nombre={conductor.nombre} neutro className="size-10 text-sm" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-semibold">
            {conductor.nombre ?? "Sin nombre"}
          </span>
          <span className="truncate text-[13px] text-tenue">
            {conductor.en_flota ? conductor.email : "Ya no está en la flota"}
          </span>
        </span>
        <span
          className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-bold ${
            conductor.viajes > 0
              ? "bg-acento text-white"
              : "bg-crema-oscuro text-tenue"
          }`}
        >
          {cargando
            ? "…"
            : `${conductor.viajes} ${conductor.viajes === 1 ? "viaje" : "viajes"}`}
        </span>
        <IconoChevron
          className={`size-4 shrink-0 text-tenue transition-transform ${abierto ? "rotate-90" : ""}`}
        />
      </button>

      {abierto && viajes && (
        <div className="flex flex-col gap-3 bg-crema/60 px-4 pt-1 pb-4">
          {/* Sólo en flota: la remisería no ve el perfil de un ex conductor (Spec 29). */}
          {conductor.en_flota && (
            <Link
              href={`/usuarios/${conductor.id}`}
              className={`${enlaceCls} self-start text-sm`}
            >
              Ver perfil
            </Link>
          )}
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-white px-1 py-2">
              <dd className="text-sm font-bold">{formatoPesos(conductor.facturado)}</dd>
              <dt className="text-[11px] text-tenue">Facturado</dt>
            </div>
            <div className="rounded-xl bg-white px-1 py-2">
              <dd className="text-sm font-bold">{formatoPesos(conductor.recaudado)}</dd>
              <dt className="text-[11px] text-tenue">Remisería</dt>
            </div>
            <div className="rounded-xl bg-white px-1 py-2">
              <dd className="text-sm font-bold">{formatoPesos(conductor.comision)}</dd>
              <dt className="text-[11px] text-tenue">Comisión</dt>
            </div>
          </dl>

          {conductor.pendiente_cobro > 0 && (
            <p className="text-[13px] text-aviso">
              Efectivo a confirmar: {formatoPesos(conductor.pendiente_cobro)}
            </p>
          )}

          {viajes && (
            <>
              <h3 className="text-[13px] font-semibold text-tinta-suave">
                Últimos viajes cerrados
              </h3>
              <ul className="flex flex-col gap-2">
                {viajes.length === 0 ? (
                  <li className="text-sm text-tenue">Sin viajes cerrados.</li>
                ) : (
                  viajes.map((v) => (
                    <li key={v.id} className="rounded-xl bg-white px-3 py-2.5 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 truncate font-semibold">
                          {v.origen_label} → {v.destino_label}
                        </p>
                        <Estado estado={v.estado} />
                      </div>
                      <p className="text-[13px] text-tenue">
                        {fechaCorta(v.cerrado_at ?? v.created_at)} ·{" "}
                        {formatoKm(v.distancia_m)} · {formatoPesos(v.tarifa_estimada)}
                      </p>
                    </li>
                  ))
                )}
              </ul>
            </>
          )}

          {error && <MensajeError>{error}</MensajeError>}

          {conductor.en_flota && (
            <button
              type="button"
              onClick={quitar}
              disabled={pendiente}
              className={`${btnChico} self-start text-peligro`}
            >
              Quitar de la flota
            </button>
          )}
        </div>
      )}
    </li>
  );
}

// Fila de una invitación pendiente: email del conductor invitado + "Cancelar".
function FilaInvitacion({ invitacion }: { invitacion: InvitacionPendiente }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const cancelar = () =>
    startTransition(async () => {
      setError(null);
      const res = await cancelarInvitacion(invitacion.id);
      if (res?.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });

  return (
    <li className="flex flex-col gap-2 border-b border-linea px-4 py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-borde text-sm font-bold text-tenue"
        >
          {iniciales(invitacion.nombre ?? invitacion.email)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-semibold">
            {invitacion.nombre ?? invitacion.email}
          </span>
          <span className="truncate text-[13px] text-tenue">
            Invitado el {fechaCorta(invitacion.created_at)}
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-aviso-suave px-3 py-1.5 text-[13px] font-bold text-aviso">
          Pendiente
        </span>
      </div>
      <button
        type="button"
        onClick={cancelar}
        disabled={pendiente}
        className={`${btnChico} self-end`}
      >
        Cancelar invitación
      </button>
      {error && <MensajeError>{error}</MensajeError>}
    </li>
  );
}

// Gestión de conductores de la empresa: lista de conductores con sus cifras del
// período, invitaciones pendientes y el formulario para invitar por email.
export default function GestionConductores({
  conductores,
  invitaciones,
  periodo,
}: {
  conductores: EstadisticaConductor[];
  invitaciones: InvitacionPendiente[];
  periodo: string; // "hoy", "esta semana", "este mes"
}) {
  const router = useRouter();
  const [invitando, setInvitando] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const invitar = () =>
    startTransition(async () => {
      setError(null);
      const res = await invitarConductor(email);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setEmail("");
      setInvitando(false);
      router.refresh();
    });

  const vacio = conductores.length === 0 && invitaciones.length === 0;

  return (
    <div className="flex flex-1 flex-col gap-3">
      <h2 className={`${seccionCls} mt-2`}>Mis conductores · {periodo}</h2>

      {vacio ? (
        <p className="rounded-[20px] bg-white px-4 py-6 text-center text-sm text-tenue">
          Todavía no tenés conductores. Invitá al primero con su email.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-[20px] bg-white">
          {conductores.map((c) => (
            <FilaConductor key={c.id} conductor={c} />
          ))}
          {invitaciones.map((i) => (
            <FilaInvitacion key={i.id} invitacion={i} />
          ))}
        </ul>
      )}

      <div className="mt-auto flex flex-col gap-3 pt-3">
        {invitando ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              invitar();
            }}
            className="flex flex-col gap-3 rounded-[20px] bg-white p-4"
          >
            <label className="flex flex-col gap-2">
              <span className={etiquetaCls}>Email del conductor</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={pendiente}
                placeholder="nombre@correo.com"
                autoFocus
                required
                className={inputCls}
              />
            </label>
            <p className="text-[13px] text-tenue">
              El conductor tiene que aceptar la invitación desde su perfil.
            </p>
            {error && <MensajeError>{error}</MensajeError>}
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setInvitando(false);
                  setError(null);
                }}
                disabled={pendiente}
                className={`${btnSecundario} flex-1`}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pendiente || email.trim() === ""}
                className={`${btnPrimario} flex-[2]`}
              >
                {pendiente ? "Enviando…" : "Enviar invitación"}
              </button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => setInvitando(true)} className={btnPrimario}>
            <IconoMas />
            Invitar conductor
          </button>
        )}
      </div>
    </div>
  );
}
