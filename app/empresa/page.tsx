import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, perfilCompleto } from "@/lib/perfil";
import { getConductores, getInvitaciones } from "@/app/actions/empresa";
import { formatoPesos, formatoPesosCompacto } from "@/lib/formato";
import { IconoMenu } from "@/components/iconos";
import { Avatar, BarraSuperior } from "@/components/ui";
import GestionConductores from "./gestion-conductores";

// P12 · Panel de remisería. Las métricas son del día (empresa_conductores() las
// calcula con el día local de Argentina).
export default async function EmpresaPage() {
  const supabase = await createClient();
  const { profile } = await getPerfil(supabase);

  if (!profile) redirect("/login");
  if (profile.role === "pasajero") redirect("/viajar");
  if (profile.role === "conductor") redirect("/conducir");
  if (!perfilCompleto(profile, null)) redirect("/perfil");

  const [conductores, invitaciones] = await Promise.all([
    getConductores(),
    getInvitaciones(),
  ]);

  const viajesHoy = conductores.reduce((s, c) => s + c.finalizadas_hoy, 0);
  const recaudadoHoy = conductores.reduce((s, c) => s + c.recaudado_hoy, 0);
  const conViajes = conductores.filter((c) => c.finalizadas_hoy > 0).length;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <BarraSuperior
        titulo="Panel Remisería"
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
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate font-display text-xl font-bold">{profile.nombre}</p>
          <span className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-semibold text-acento">
            Hoy
          </span>
        </div>

        <dl className="grid grid-cols-3 gap-2">
          <div className="flex flex-col gap-1 rounded-2xl bg-white px-2.5 py-3.5">
            <dd className="font-display text-[26px] leading-none font-bold">
              {conViajes}
              <span className="text-base text-tenue">/{conductores.length}</span>
            </dd>
            <dt className="text-xs leading-snug text-tenue">Conductores con viajes</dt>
          </div>
          <div className="flex flex-col gap-1 rounded-2xl bg-white px-2.5 py-3.5">
            <dd className="font-display text-[26px] leading-none font-bold">{viajesHoy}</dd>
            <dt className="text-xs leading-snug text-tenue">Viajes</dt>
          </div>
          <div className="flex flex-col gap-1 rounded-2xl bg-acento px-2.5 py-3.5 text-white">
            <dd
              className="font-display text-[22px] leading-none font-bold"
              title={formatoPesos(recaudadoHoy)}
            >
              {formatoPesosCompacto(recaudadoHoy)}
            </dd>
            <dt className="text-xs leading-snug text-[#dce5fb]">Recaudación neta</dt>
          </div>
        </dl>

        <GestionConductores conductores={conductores} invitaciones={invitaciones} />
      </div>
    </main>
  );
}
