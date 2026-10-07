"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconoEstrella } from "@/components/iconos";
import { btnSecundario } from "@/components/ui";
import FormCalificacion, {
  ASPECTOS_CONDUCTOR,
  ASPECTOS_PASAJERO,
} from "../form-calificacion";

// Calificación del detalle de un viaje finalizado (Spec 28): muestra la que
// dio quien mira o, si todavía no calificó, ofrece el formulario de siempre.
// Nunca muestra la que dio la otra persona.
export default function CalificacionDetalle({
  tripId,
  contraparte,
  soyConductor,
  estrellas,
  comentario,
}: {
  tripId: string;
  contraparte: string;
  soyConductor: boolean;
  estrellas: number | null;
  comentario: string | null;
}) {
  const router = useRouter();
  const [calificando, setCalificando] = useState(false);

  if (estrellas !== null) {
    return (
      <div className="flex flex-col gap-2">
        <p
          role="img"
          aria-label={`${estrellas} de 5 estrellas`}
          className="flex gap-0.5"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <IconoEstrella
              key={n}
              className={`size-6 ${n <= estrellas ? "text-estrella" : "text-borde"}`}
            />
          ))}
        </p>
        {comentario && <p className="text-sm text-tinta-suave">{comentario}</p>}
      </div>
    );
  }

  if (!calificando) {
    return (
      <button
        type="button"
        onClick={() => setCalificando(true)}
        className={`${btnSecundario} h-11 text-[15px]`}
      >
        Calificar a {contraparte}
      </button>
    );
  }

  return (
    <FormCalificacion
      tripId={tripId}
      aspectos={soyConductor ? ASPECTOS_PASAJERO : ASPECTOS_CONDUCTOR}
      onCerrar={() => setCalificando(false)}
      onListo={() => {
        setCalificando(false);
        router.refresh();
      }}
    />
  );
}
