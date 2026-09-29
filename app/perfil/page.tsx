import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { cerrarSesion } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, perfilCompleto } from "@/lib/perfil";
import { getReputacion } from "@/app/actions/viaje";
import { getMisInvitaciones, getMiEmpresa } from "@/app/actions/invitaciones";
import { estrellas } from "@/lib/formato";
import type { MiInvitacion, UserRole } from "@/lib/supabase/types";
import {
  IconoAjustes,
  IconoChevron,
  IconoEscudo,
  IconoMensaje,
  IconoReloj,
  IconoTarjeta,
} from "@/components/iconos";
import { Avatar, BarraSuperior, btnSecundario, enlaceCls } from "@/components/ui";
import InvitacionesConductor from "./invitaciones-conductor";

const INICIO: Record<UserRole, string> = {
  pasajero: "/viajar",
  conductor: "/conducir",
  empresa: "/empresa",
};

const ROL: Record<UserRole, string> = {
  pasajero: "Pasajero",
  conductor: "Conductor",
  empresa: "Remisería",
};

function Opcion({
  href,
  icono,
  children,
}: {
  href?: string;
  icono: ReactNode;
  children: ReactNode;
}) {
  const contenido = (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-crema">
        {icono}
      </span>
      <span className="flex-1 text-base font-medium">{children}</span>
      {href ? (
        <IconoChevron className="size-[18px] text-tenue" />
      ) : (
        <span className="rounded-full bg-crema-oscuro px-2.5 py-1 text-xs font-semibold text-tenue">
          Próximamente
        </span>
      )}
    </>
  );
  const cls =
    "flex min-h-15 items-center gap-3.5 border-b border-linea px-4 last:border-b-0";
  return (
    <li>
      {href ? (
        <Link href={href} className={`${cls} transition-colors hover:bg-crema/60`}>
          {contenido}
        </Link>
      ) : (
        <div aria-disabled="true" className={`${cls} text-tenue`}>
          {contenido}
        </div>
      )}
    </li>
  );
}

// P10 · Menú de usuario: datos y reputación, accesos y cierre de sesión. Si el
// perfil está incompleto, primero hay que completarlo.
export default async function PerfilPage() {
  const supabase = await createClient();
  const { profile, vehicle } = await getPerfil(supabase);
  if (!profile) redirect("/login");
  if (!perfilCompleto(profile, vehicle)) redirect("/perfil/editar");

  const esConductor = profile.role === "conductor";
  const esEmpresa = profile.role === "empresa";
  const reputacion = esEmpresa ? null : estrellas(await getReputacion(profile.id));

  // Sólo el conductor ve invitaciones y su remisería (ver Spec 11).
  let invitaciones: MiInvitacion[] = [];
  let empresaNombre: string | null = null;
  if (esConductor) {
    [invitaciones, empresaNombre] = await Promise.all([
      getMisInvitaciones(),
      getMiEmpresa(),
    ]);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <BarraSuperior titulo="Mi perfil" volverHref={INICIO[profile.role]} />

      <div className="flex flex-1 flex-col gap-5 px-5 pt-3 pb-8">
        <div className="flex items-center gap-4 rounded-[20px] bg-white p-4.5">
          <Avatar nombre={profile.nombre} className="size-17 text-[22px]" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="truncate font-display text-[22px] font-bold">{profile.nombre}</p>
            <p className="text-sm text-tenue">
              {reputacion ? `${reputacion} · ` : ""}
              {ROL[profile.role]}
            </p>
            {vehicle && (
              <p className="truncate text-sm text-tenue">
                {vehicle.marca} {vehicle.modelo} · {vehicle.patente}
              </p>
            )}
            <Link href="/perfil/editar" className={`${enlaceCls} mt-1 text-sm`}>
              Editar perfil
            </Link>
          </div>
        </div>

        {esConductor && (
          <InvitacionesConductor
            invitaciones={invitaciones}
            empresaNombre={empresaNombre}
          />
        )}

        <nav aria-label="Menú de usuario">
          <ul className="overflow-hidden rounded-[20px] bg-white">
            {!esEmpresa && (
              <Opcion href="/viajes" icono={<IconoReloj />}>
                Historial de viajes
              </Opcion>
            )}
            <Opcion icono={<IconoTarjeta className="size-5" />}>Métodos de pago</Opcion>
            <Opcion href="/perfil/contactos" icono={<IconoEscudo />}>
              Contactos de confianza
            </Opcion>
            <Opcion icono={<IconoMensaje />}>Reclamos</Opcion>
            <Opcion icono={<IconoAjustes />}>Configuración</Opcion>
          </ul>
        </nav>

        <form action={cerrarSesion} className="mt-auto">
          <button type="submit" className={`${btnSecundario} text-peligro`}>
            Cerrar sesión
          </button>
        </form>
      </div>
    </main>
  );
}
