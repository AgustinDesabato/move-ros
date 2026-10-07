import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { estrellas, mesAnio } from "@/lib/formato";
import type { ComentarioRecibido, PerfilPublico } from "@/lib/supabase/types";
import { IconoEstrella } from "@/components/iconos";
import { Avatar, BarraSuperior, seccionCls } from "@/components/ui";
import BotonVolver from "./boton-volver";

// Tope de comentarios_recibidos() en la migración 0029.
const COMENTARIOS_MAX = 20;

function FilaComentario({ comentario }: { comentario: ComentarioRecibido }) {
  return (
    <li className="flex flex-col gap-1.5 border-b border-linea px-4 py-3.5 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <span
          role="img"
          aria-label={`${comentario.estrellas} de 5 estrellas`}
          className="flex gap-0.5"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <IconoEstrella
              key={n}
              className={`size-[18px] ${
                n <= comentario.estrellas ? "text-estrella" : "text-borde"
              }`}
            />
          ))}
        </span>
        <span className="text-[13px] text-tenue">{mesAnio(comentario.mes)}</span>
      </div>
      <p className="text-sm text-tinta-suave">{comentario.comentario}</p>
    </li>
  );
}

// Spec 29 · Perfil público de un pasajero o conductor: promedio de estrellas
// y comentarios recibidos, anónimos. Quién puede verlo lo decide la base
// (relacion_perfil): sin relación, las RPC no devuelven nada.
export default async function PerfilPublicoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Sin fila: no hay relación con esa persona, el id no existe o no es un
  // uuid (la RPC da error), o no es pasajero ni conductor.
  const { data } = await supabase.rpc("perfil_publico", { p_user_id: id });
  const perfil = (data as PerfilPublico[] | null)?.[0];
  if (!perfil) notFound();

  const [
    { data: filas },
    {
      data: { user },
    },
  ] = await Promise.all([
    supabase.rpc("comentarios_recibidos", { p_user_id: id }),
    supabase.auth.getUser(),
  ]);
  const comentarios = (filas as ComentarioRecibido[] | null) ?? [];
  const esPropio = user?.id === perfil.id;
  const rol = perfil.role === "conductor" ? "Conductor" : "Pasajero";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <BarraSuperior
        titulo={esPropio ? "Mi perfil público" : "Perfil"}
        izquierda={<BotonVolver />}
      />

      <div className="flex flex-1 flex-col gap-5 px-5 pt-3 pb-8">
        <div className="flex items-center gap-4 rounded-[20px] bg-white p-4.5">
          <Avatar nombre={perfil.nombre} className="size-17 text-[22px]" />
          <div className="flex min-w-0 flex-col gap-0.5">
            {/* Con sólo una oferta abierta, el conductor todavía no ve el nombre. */}
            <p className="truncate font-display text-[22px] font-bold">
              {perfil.nombre ?? rol}
            </p>
            <p className="text-sm text-tenue">
              {estrellas({ promedio: perfil.promedio, cantidad: perfil.cantidad })}
              {perfil.nombre ? ` · ${rol}` : ""}
            </p>
          </div>
        </div>

        <section className="flex flex-col gap-2">
          <h2 className={seccionCls}>Comentarios</h2>
          {comentarios.length > 0 ? (
            <>
              <ul className="overflow-hidden rounded-[20px] bg-white">
                {comentarios.map((c, i) => (
                  // Los comentarios no traen id: no hay nada que los identifique.
                  <FilaComentario key={i} comentario={c} />
                ))}
              </ul>
              {comentarios.length >= COMENTARIOS_MAX && (
                <p className="text-[13px] text-tenue">
                  Se muestran los {COMENTARIOS_MAX} más recientes.
                </p>
              )}
            </>
          ) : (
            <p className="rounded-2xl bg-white px-4 py-4 text-sm text-tenue">
              {esPropio
                ? "Todavía no recibiste comentarios."
                : "Todavía no recibió comentarios."}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
