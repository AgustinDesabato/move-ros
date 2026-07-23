"use client";

import { useState, useTransition } from "react";
import { calificarViaje } from "@/app/actions/viaje";

const MAX_COMENTARIO = 280;

// Formulario de calificación reutilizable: lo usan el prompt inmediato (al
// finalizar el viaje en /viajar y /conducir) y el botón "Calificar" del
// historial. Estrellas 1-5 + comentario opcional. La ✕ cierra sin calificar
// (onCerrar); al enviar con éxito llama onListo.
export default function FormCalificacion({
  tripId,
  contraparte,
  onCerrar,
  onListo,
}: {
  tripId: string;
  contraparte: string;
  onCerrar: () => void;
  onListo: () => void;
}) {
  const [estrellas, setEstrellas] = useState(0);
  const [hover, setHover] = useState(0);
  const [comentario, setComentario] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const enviar = () =>
    startTransition(async () => {
      setError(null);
      const res = await calificarViaje(tripId, estrellas, comentario);
      if (res?.error) {
        setError(res.error);
        return;
      }
      onListo();
    });

  return (
    <div className="rounded-2xl border border-black/10 p-4 dark:border-white/15">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium">Calificá a {contraparte}</p>
        <button
          type="button"
          aria-label="Cerrar sin calificar"
          onClick={onCerrar}
          disabled={pendiente}
          className="-mt-1 -mr-1 rounded-full px-2 py-0.5 text-lg leading-none text-zinc-400 transition-colors hover:bg-black/5 hover:text-zinc-600 disabled:opacity-50 dark:hover:bg-white/10 dark:hover:text-zinc-200"
        >
          ✕
        </button>
      </div>

      <div className="mt-3 flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} estrella${n > 1 ? "s" : ""}`}
            disabled={pendiente}
            onClick={() => setEstrellas(n)}
            onMouseEnter={() => setHover(n)}
            className="text-2xl leading-none text-amber-500 transition-transform hover:scale-110 disabled:opacity-50"
          >
            {n <= (hover || estrellas) ? "★" : "☆"}
          </button>
        ))}
      </div>

      <textarea
        value={comentario}
        onChange={(e) => setComentario(e.target.value.slice(0, MAX_COMENTARIO))}
        disabled={pendiente}
        rows={2}
        placeholder="Dejá un comentario (opcional)"
        className="mt-3 w-full resize-none rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 disabled:opacity-50 dark:border-white/15 dark:focus:border-white/30"
      />
      <p className="mt-1 text-right text-xs text-zinc-400">
        {comentario.length}/{MAX_COMENTARIO}
      </p>

      {error && (
        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <button
        type="button"
        onClick={enviar}
        disabled={estrellas === 0 || pendiente}
        className="mt-2 w-full rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        Enviar
      </button>
    </div>
  );
}
