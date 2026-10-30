import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, perfilCompleto } from "@/lib/perfil";
import { getUsuariosSoporte } from "@/app/actions/soporte";
import { fechaCorta } from "@/lib/formato";
import type { UserRole, UsuarioSoporte } from "@/lib/supabase/types";
import { IconoMenu } from "@/components/iconos";
import { Avatar, BarraSuperior, seccionCls } from "@/components/ui";
import Pestanas from "../pestanas";
import { AprobarForm, SuspenderForm } from "./acciones-usuario";

const ROLES: Record<UserRole, string> = {
  pasajero: "Pasajero",
  conductor: "Conductor",
  empresa: "Remisería",
  soporte: "Soporte",
};

// Filtro por rol de la lista general (?rol=). Sin valor o con uno
// desconocido, se muestran todos.
const FILTROS: { valor: UserRole | null; texto: string }[] = [
  { valor: null, texto: "Todos" },
  { valor: "pasajero", texto: "Pasajeros" },
  { valor: "conductor", texto: "Conductores" },
  { valor: "empresa", texto: "Remiserías" },
];

function leerRol(v: string | string[] | undefined): UserRole | null {
  const rol = Array.isArray(v) ? v[0] : v;
  return FILTROS.some((f) => f.valor === rol) ? (rol as UserRole) : null;
}

function Vehiculo({ usuario }: { usuario: UsuarioSoporte }) {
  if (!usuario.marca) {
    return <p className="text-[13px] text-aviso">Todavía no cargó su vehículo.</p>;
  }
  return (
    <p className="text-[13px] text-tenue">
      {usuario.marca} {usuario.modelo} · {usuario.color} · {usuario.patente}
    </p>
  );
}

function FilaPendiente({ usuario }: { usuario: UsuarioSoporte }) {
  return (
    <li className="flex items-start justify-between gap-3 border-b border-linea px-4 py-3.5 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[15px] font-semibold">
          {usuario.nombre ?? "Sin nombre"}
        </span>
        <p className="truncate text-[13px] text-tenue">{usuario.email}</p>
        {usuario.telefono && <p className="text-[13px] text-tenue">{usuario.telefono}</p>}
        <Vehiculo usuario={usuario} />
        {usuario.empresa && (
          <p className="text-[13px] text-tenue">Remisería: {usuario.empresa}</p>
        )}
      </div>
      {usuario.marca && (
        <div className="shrink-0">
          <AprobarForm userId={usuario.id} />
        </div>
      )}
    </li>
  );
}

function FilaUsuario({ usuario }: { usuario: UsuarioSoporte }) {
  return (
    <li className="flex items-start justify-between gap-3 border-b border-linea px-4 py-3.5 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold">
            {usuario.nombre ?? "Sin nombre"}
          </span>
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              usuario.suspendido
                ? "bg-peligro-suave text-peligro"
                : "bg-exito-suave text-exito"
            }`}
          >
            {usuario.suspendido ? "Suspendido" : "Activo"}
          </span>
        </div>
        <p className="truncate text-[13px] text-tenue">{usuario.email}</p>
        <p className="text-[13px] text-tenue">
          {ROLES[usuario.role]} · Alta {fechaCorta(usuario.created_at)}
        </p>
        {usuario.role === "conductor" && <Vehiculo usuario={usuario} />}
        {usuario.empresa && (
          <p className="text-[13px] text-tenue">Remisería: {usuario.empresa}</p>
        )}
      </div>
      {usuario.role !== "soporte" && (
        <div className="shrink-0">
          <SuspenderForm userId={usuario.id} suspendido={usuario.suspendido} />
        </div>
      )}
    </li>
  );
}

// Spec 35 · Usuarios de la plataforma: primero los conductores pendientes de
// aprobación (no reciben viajes hasta que soporte los aprueba), después todos
// los demás, con suspender/reactivar y un filtro por rol.
export default async function UsuariosSoportePage({
  searchParams,
}: {
  searchParams: Promise<{ rol?: string | string[] }>;
}) {
  const supabase = await createClient();
  const { profile } = await getPerfil(supabase);

  if (!profile) redirect("/login");
  if (profile.role === "pasajero") redirect("/viajar");
  if (profile.role === "conductor") redirect("/conducir");
  if (profile.role === "empresa") redirect("/empresa");
  if (!perfilCompleto(profile, null)) redirect("/perfil");

  const rol = leerRol((await searchParams).rol);
  const usuarios = await getUsuariosSoporte();

  const esPendiente = (u: UsuarioSoporte) => u.role === "conductor" && !u.aprobado;
  const pendientes = usuarios.filter(esPendiente);
  const resto = usuarios.filter((u) => !esPendiente(u) && (!rol || u.role === rol));

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
        <Pestanas activa="usuarios" />

        {pendientes.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className={seccionCls}>Pendientes de aprobación</h2>
            <ul className="overflow-hidden rounded-[20px] bg-white">
              {pendientes.map((u) => (
                <FilaPendiente key={u.id} usuario={u} />
              ))}
            </ul>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h2 className={seccionCls}>Usuarios</h2>
          <nav aria-label="Filtrar por rol" className="flex flex-wrap gap-2">
            {FILTROS.map((f) => {
              const activo = f.valor === rol;
              return (
                <Link
                  key={f.texto}
                  href={f.valor ? `/soporte/usuarios?rol=${f.valor}` : "/soporte/usuarios"}
                  aria-current={activo ? "page" : undefined}
                  className={`flex h-9 items-center rounded-full px-3.5 text-sm font-semibold transition-colors ${
                    activo
                      ? "bg-acento text-white"
                      : "bg-white text-tinta-suave hover:bg-crema-oscuro"
                  }`}
                >
                  {f.texto}
                </Link>
              );
            })}
          </nav>
          {resto.length > 0 ? (
            <ul className="overflow-hidden rounded-[20px] bg-white">
              {resto.map((u) => (
                <FilaUsuario key={u.id} usuario={u} />
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl bg-white px-4 py-4 text-sm text-tenue">
              No hay usuarios para mostrar.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
