import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getReclamos } from "@/app/actions/reclamos";
import { fechaCorta } from "@/lib/formato";
import type { ReclamoConViaje } from "@/lib/supabase/types";
import { BarraSuperior } from "@/components/ui";
import ReclamoForm from "./reclamo-form";

// Etiqueta de estado del reclamo: abierto (pendiente) o resuelto.
function Estado({ estado }: { estado: ReclamoConViaje["estado"] }) {
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

function FilaReclamo({ reclamo }: { reclamo: ReclamoConViaje }) {
  return (
    <li className="flex flex-col gap-2 border-b border-linea px-4 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 truncate text-[15px] font-semibold">{reclamo.motivo}</span>
        <Estado estado={reclamo.estado} />
      </div>
      {reclamo.trips && (
        <p className="truncate text-[13px] text-tenue">
          {reclamo.trips.origen_label} → {reclamo.trips.destino_label}
        </p>
      )}
      <p className="text-sm text-tinta-suave">{reclamo.descripcion}</p>
      <p className="text-[13px] text-tenue">{fechaCorta(reclamo.created_at)}</p>
    </li>
  );
}

// /perfil/reclamos: mis reclamos (ligados o no a un viaje) + alta de uno
// nuevo. Ver estado (abierto/resuelto) de cada uno (Spec 13).
export default async function ReclamosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const reclamos = await getReclamos();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <BarraSuperior titulo="Reclamos" volverHref="/perfil" />

      <div className="flex flex-1 flex-col gap-4 px-5 pt-2 pb-8">
        <p className="text-[15px] text-tenue">
          Reportá un problema, ligado o no a un viaje, y seguí su estado acá.
        </p>

        {reclamos.length > 0 && (
          <ul className="overflow-hidden rounded-[20px] bg-white">
            {reclamos.map((r) => (
              <FilaReclamo key={r.id} reclamo={r} />
            ))}
          </ul>
        )}

        <ReclamoForm />
      </div>
    </main>
  );
}
