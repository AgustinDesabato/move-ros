import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, perfilCompleto } from "@/lib/perfil";
import { getReclamosSoporte } from "@/app/actions/reclamos";
import { fechaCorta } from "@/lib/formato";
import type { ReclamoSoporte } from "@/lib/supabase/types";
import { IconoMenu } from "@/components/iconos";
import { Avatar, BarraSuperior } from "@/components/ui";
import ResolverForm from "./resolver-form";

// Etiqueta de estado del reclamo, igual que en /perfil/reclamos.
function Estado({ estado }: { estado: ReclamoSoporte["estado"] }) {
  const resuelto = estado === "resuelto";
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
        resuelto ? "bg-exito-suave text-exito" : "bg-aviso-suave text-aviso"
      }`}
    >
      {resuelto ? "Resuelto" : "Abierto"}
    </span>
  );
}

function FilaReclamo({ reclamo }: { reclamo: ReclamoSoporte }) {
  return (
    <li className="flex flex-col gap-2 border-b border-linea px-4 py-3.5 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 truncate text-[15px] font-semibold">{reclamo.motivo}</span>
        <Estado estado={reclamo.estado} />
      </div>
      <p className="text-[13px] text-tenue">{reclamo.nombre_usuario ?? reclamo.email}</p>
      {reclamo.trip_id && (
        <p className="truncate text-[13px] text-tenue">
          {reclamo.origen_label} → {reclamo.destino_label}
        </p>
      )}
      <p className="text-sm text-tinta-suave">{reclamo.descripcion}</p>
      <p className="text-[13px] text-tenue">{fechaCorta(reclamo.created_at)}</p>

      {reclamo.estado === "resuelto" ? (
        reclamo.respuesta && (
          <div className="mt-1 rounded-[14px] bg-crema px-3.5 py-3">
            <p className="text-[13px] font-semibold text-tinta-suave">Respuesta</p>
            <p className="text-sm text-tinta">{reclamo.respuesta}</p>
          </div>
        )
      ) : (
        <ResolverForm reclamoId={reclamo.id} />
      )}
    </li>
  );
}

// Spec 22 · Panel de soporte: todos los reclamos de todos los usuarios,
// abiertos primero. Resolver uno pide una respuesta (ver resolver-form.tsx).
export default async function SoportePage() {
  const supabase = await createClient();
  const { profile } = await getPerfil(supabase);

  if (!profile) redirect("/login");
  if (profile.role === "pasajero") redirect("/viajar");
  if (profile.role === "conductor") redirect("/conducir");
  if (profile.role === "empresa") redirect("/empresa");
  if (!perfilCompleto(profile, null)) redirect("/perfil");

  const reclamos = await getReclamosSoporte();

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
        <p className="text-[15px] text-tenue">
          Reclamos de todos los usuarios. Los abiertos van primero.
        </p>

        {reclamos.length > 0 ? (
          <ul className="overflow-hidden rounded-[20px] bg-white">
            {reclamos.map((r) => (
              <FilaReclamo key={r.id} reclamo={r} />
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl bg-white px-4 py-4 text-sm text-tenue">
            No hay reclamos todavía.
          </p>
        )}
      </div>
    </main>
  );
}
