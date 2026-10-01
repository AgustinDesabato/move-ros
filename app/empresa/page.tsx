import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, perfilCompleto } from "@/lib/perfil";
import {
  getEstadisticasConductores,
  getInvitaciones,
  getResumen,
} from "@/app/actions/empresa";
import { formatoPesos, formatoPesosCompacto } from "@/lib/formato";
import { PERIODOS, leerPeriodo, textoRango, tituloPeriodo } from "@/lib/periodo";
import { IconoMenu } from "@/components/iconos";
import { Avatar, BarraSuperior } from "@/components/ui";
import GestionConductores from "./gestion-conductores";

// P12 · Panel de remisería. Las cifras son del período elegido en ?periodo=
// (hoy por defecto) y las calcula la base: empresa_resumen para los totales y
// empresa_estadisticas_conductores por conductor (Spec 17).
export default async function EmpresaPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string | string[] }>;
}) {
  const supabase = await createClient();
  const { profile } = await getPerfil(supabase);

  if (!profile) redirect("/login");
  if (profile.role === "pasajero") redirect("/viajar");
  if (profile.role === "conductor") redirect("/conducir");
  if (!perfilCompleto(profile, null)) redirect("/perfil");

  const periodo = leerPeriodo((await searchParams).periodo);
  const [resumen, conductores, invitaciones] = await Promise.all([
    getResumen(periodo),
    getEstadisticasConductores(periodo),
    getInvitaciones(),
  ]);

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
          {resumen && periodo !== "hoy" && (
            <span className="shrink-0 text-sm font-semibold text-tenue">
              {textoRango(resumen.desde, resumen.hasta)}
            </span>
          )}
        </div>

        <nav
          aria-label="Período"
          className="grid grid-cols-3 gap-1 rounded-[14px] bg-crema-oscuro p-1"
        >
          {PERIODOS.map((p) => {
            const activo = p.valor === periodo;
            return (
              <Link
                key={p.valor}
                href={p.valor === "hoy" ? "/empresa" : `/empresa?periodo=${p.valor}`}
                aria-current={activo ? "page" : undefined}
                replace
                scroll={false}
                className={`flex h-10 items-center justify-center rounded-[10px] text-[15px] transition-colors focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none ${
                  activo
                    ? "bg-white font-bold text-acento shadow-[0_1px_3px_rgba(21,23,28,0.15)]"
                    : "font-medium text-tinta-suave hover:bg-white/50"
                }`}
              >
                {p.etiqueta}
              </Link>
            );
          })}
        </nav>

        {resumen ? (
          <>
            <dl className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-1 rounded-2xl bg-white px-2.5 py-3.5">
                <dd className="font-display text-[26px] leading-none font-bold">
                  {resumen.conductores_con_viajes}
                  <span className="text-base text-tenue">/{resumen.conductores_flota}</span>
                </dd>
                <dt className="text-xs leading-snug text-tenue">Conductores con viajes</dt>
              </div>
              <div className="flex flex-col gap-1 rounded-2xl bg-white px-2.5 py-3.5">
                <dd className="font-display text-[26px] leading-none font-bold">
                  {resumen.viajes}
                </dd>
                <dt className="text-xs leading-snug text-tenue">Viajes</dt>
              </div>
              <div className="flex flex-col gap-1 rounded-2xl bg-acento px-2.5 py-3.5 text-white">
                <dd
                  className="font-display text-[22px] leading-none font-bold"
                  title={formatoPesos(resumen.recaudado)}
                >
                  {formatoPesosCompacto(resumen.recaudado)}
                </dd>
                <dt className="text-xs leading-snug text-[#dce5fb]">Recaudación neta</dt>
              </div>
            </dl>

            <dl className="flex flex-col gap-1.5 rounded-2xl bg-white px-4 py-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-tenue">Facturado</dt>
                <dd className="font-semibold">{formatoPesos(resumen.facturado)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-tenue">Comisión de plataforma</dt>
                <dd className="font-semibold">−{formatoPesos(resumen.comision)}</dd>
              </div>
              {resumen.pendiente_cobro > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-tenue">Efectivo a confirmar</dt>
                  <dd className="font-semibold text-aviso">
                    {formatoPesos(resumen.pendiente_cobro)}
                  </dd>
                </div>
              )}
            </dl>
          </>
        ) : (
          <p className="rounded-2xl bg-white px-4 py-4 text-sm text-tenue">
            No se pudieron cargar las estadísticas. Probá recargar la página.
          </p>
        )}

        <GestionConductores
          conductores={conductores}
          invitaciones={invitaciones}
          periodo={tituloPeriodo(periodo)}
        />
      </div>
    </main>
  );
}
