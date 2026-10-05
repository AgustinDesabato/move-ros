import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, perfilCompleto } from "@/lib/perfil";
import { getAlertasSoporte } from "@/app/actions/seguridad";
import { IconoMenu } from "@/components/iconos";
import { Avatar, BarraSuperior } from "@/components/ui";
import VistaAlertas from "./vista-alertas";

// Pestañas entre las dos secciones del panel de soporte (Spec 22/23).
function Pestanas({ activa }: { activa: "reclamos" | "alertas" }) {
  const base =
    "flex h-10 items-center justify-center rounded-[10px] text-[15px] transition-colors focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none";
  const on = "bg-white font-bold text-acento shadow-[0_1px_3px_rgba(21,23,28,0.15)]";
  const off = "font-medium text-tinta-suave hover:bg-white/50";
  return (
    <nav
      aria-label="Secciones de soporte"
      className="grid grid-cols-2 gap-1 rounded-[14px] bg-crema-oscuro p-1"
    >
      <Link
        href="/soporte"
        aria-current={activa === "reclamos" ? "page" : undefined}
        className={`${base} ${activa === "reclamos" ? on : off}`}
      >
        Reclamos
      </Link>
      <Link
        href="/soporte/alertas"
        aria-current={activa === "alertas" ? "page" : undefined}
        className={`${base} ${activa === "alertas" ? on : off}`}
      >
        Alertas
      </Link>
    </nav>
  );
}

// Spec 23 · Alertas de emergencia de todos los usuarios: mapa + lista.
export default async function AlertasSoportePage() {
  const supabase = await createClient();
  const { profile } = await getPerfil(supabase);

  if (!profile) redirect("/login");
  if (profile.role === "pasajero") redirect("/viajar");
  if (profile.role === "conductor") redirect("/conducir");
  if (profile.role === "empresa") redirect("/empresa");
  if (!perfilCompleto(profile, null)) redirect("/perfil");

  const alertas = await getAlertasSoporte();

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
        <Pestanas activa="alertas" />
        <VistaAlertas alertas={alertas} />
      </div>
    </main>
  );
}
