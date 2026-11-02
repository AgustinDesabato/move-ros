import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, perfilCompleto } from "@/lib/perfil";
import { getViajesSoporte } from "@/app/actions/soporte";
import { fechaCorta, formatoPesos, metodoPago } from "@/lib/formato";
import type { TripStatus, ViajeSoporte } from "@/lib/supabase/types";
import { IconoMenu } from "@/components/iconos";
import { Avatar, BarraSuperior, seccionCls } from "@/components/ui";
import Pestanas from "../pestanas";

const ACTIVOS: TripStatus[] = ["pendiente", "aceptada", "en_curso"];

const ESTADOS: Record<TripStatus, { texto: string; cls: string }> = {
  pendiente: { texto: "Buscando conductor", cls: "bg-aviso-suave text-aviso" },
  aceptada: { texto: "Aceptado", cls: "bg-acento-suave text-acento" },
  en_curso: { texto: "En curso", cls: "bg-acento-suave text-acento" },
  finalizada: { texto: "Finalizado", cls: "bg-exito-suave text-exito" },
  cancelada: { texto: "Cancelado", cls: "bg-crema-oscuro text-tinta-suave" },
};

function FilaViaje({ viaje }: { viaje: ViajeSoporte }) {
  const estado = ESTADOS[viaje.estado];
  return (
    <li className="flex flex-col gap-1 border-b border-linea px-4 py-3.5 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 truncate text-[15px] font-semibold">
          {viaje.origen_label} → {viaje.destino_label}
        </span>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${estado.cls}`}
        >
          {estado.texto}
        </span>
      </div>
      <p className="text-[13px] text-tenue">
        Pasajero: {viaje.pasajero ?? "Sin nombre"} · Conductor:{" "}
        {viaje.conductor ?? "Sin asignar"}
      </p>
      <p className="text-[13px] text-tenue">
        {formatoPesos(viaje.tarifa_estimada)} · {metodoPago(viaje.metodo_pago)} ·{" "}
        {fechaCorta(viaje.cerrado_at ?? viaje.created_at)}
      </p>
    </li>
  );
}

function ListaViajes({ viajes, vacio }: { viajes: ViajeSoporte[]; vacio: string }) {
  if (viajes.length === 0) {
    return <p className="rounded-2xl bg-white px-4 py-4 text-sm text-tenue">{vacio}</p>;
  }
  return (
    <ul className="overflow-hidden rounded-[20px] bg-white">
      {viajes.map((v) => (
        <FilaViaje key={v.id} viaje={v} />
      ))}
    </ul>
  );
}

// Spec 35 · Supervisión de viajes de toda la plataforma: los activos arriba y
// los últimos 50 cerrados abajo. Sólo lectura.
export default async function ViajesSoportePage() {
  const supabase = await createClient();
  const { profile } = await getPerfil(supabase);

  if (!profile) redirect("/login");
  if (profile.role === "pasajero") redirect("/viajar");
  if (profile.role === "conductor") redirect("/conducir");
  if (profile.role === "empresa") redirect("/empresa");
  if (!perfilCompleto(profile, null)) redirect("/perfil");

  const viajes = await getViajesSoporte();
  const activos = viajes.filter((v) => ACTIVOS.includes(v.estado));
  const cerrados = viajes.filter((v) => !ACTIVOS.includes(v.estado));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <BarraSuperior
        titulo="Panel Soporte"
        izquierda={
          <Link
            href="/perfil"
            aria-label="Menú de usuario"
            className="flex size-11 items-center justify-center rounded-full text-tinta transition-colors hover:bg-black/5"
          >
            <IconoMenu />
          </Link>
        }
        derecha={
          <Link href="/perfil" aria-label="Mi perfil" className="rounded-full">
            <Avatar nombre={profile.nombre} />
          </Link>
        }
      />

      <div className="flex flex-1 flex-col gap-4 px-5 pt-2 pb-8">
        <Pestanas activa="viajes" />

        <section className="flex flex-col gap-2">
          <h2 className={seccionCls}>Activos</h2>
          <ListaViajes viajes={activos} vacio="No hay viajes activos ahora." />
        </section>

        <section className="flex flex-col gap-2">
          <h2 className={seccionCls}>Últimos cerrados</h2>
          <ListaViajes viajes={cerrados} vacio="Todavía no hay viajes cerrados." />
        </section>
      </div>
    </main>
  );
}
