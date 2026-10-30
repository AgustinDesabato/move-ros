import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, perfilCompleto } from "@/lib/perfil";
import { getAlertasSoporte } from "@/app/actions/seguridad";
import { IconoMenu } from "@/components/iconos";
import { Avatar, BarraSuperior } from "@/components/ui";
import Pestanas from "../pestanas";
import VistaAlertas from "./vista-alertas";

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
