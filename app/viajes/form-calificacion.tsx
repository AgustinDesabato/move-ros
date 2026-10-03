"use client";

import { useState, useTransition } from "react";
import { calificarViaje } from "@/app/actions/viaje";
import { IconoEstrella } from "@/components/iconos";
import { MensajeError, btnPrimario, seccionCls } from "@/components/ui";

const MAX_COMENTARIO = 280;

// Aspectos destacables según a quién se califica. No son una columna aparte: se
// anteponen al comentario, así la calificación sigue siendo estrellas + texto.
export const ASPECTOS_CONDUCTOR = ["Puntual", "Amable", "Auto limpio", "Buena ruta"];
export const ASPECTOS_PASAJERO = ["Puntual", "Amable", "Respetuoso", "Buena comunicación"];

// Formulario de calificación reutilizable: lo usan la pantalla de fin de viaje
// (en /viajar y /conducir) y el botón "Calificar" del historial. Estrellas 1-5,
// aspectos destacados y comentario opcional. "Omitir" cierra sin calificar
// (onCerrar); al enviar con éxito llama onListo.
export default function FormCalificacion({
  tripId,
  aspectos = ASPECTOS_CONDUCTOR,
  onCerrar,
  onListo,
}: {
  tripId: string;
  aspectos?: string[];
  onCerrar: () => void;
  onListo: () => void;
}) {
  const [estrellas, setEstrellas] = useState(0);
  const [hover, setHover] = useState(0);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [comentario, setComentario] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const alternar = (a: string) =>
    setElegidos((prev) =>
      prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a],
    );

  const enviar = () =>
    startTransition(async () => {
      setError(null);
      const texto = [elegidos.join(", "), comentario.trim()]
        .filter(Boolean)
        .join(". ")
        .slice(0, MAX_COMENTARIO);
      const res = await calificarViaje(tripId, estrellas, texto);
      if (res?.error) {
        setError(res.error);
        return;
      }
      onListo();
    });

  return (
    <div className="flex flex-col gap-5">
      <div
        role="radiogroup"
        aria-label="Calificación"
        className="flex justify-center gap-1"
        onMouseLeave={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={estrellas === n}
            aria-label={`${n} estrella${n > 1 ? "s" : ""}`}
            disabled={pendiente}
            onClick={() => setEstrellas(n)}
            onMouseEnter={() => setHover(n)}
            className={`flex size-12 items-center justify-center transition-transform hover:scale-110 disabled:opacity-50 ${
              n <= (hover || estrellas) ? "text-estrella" : "text-borde"
            }`}
          >
            <IconoEstrella />
          </button>
        ))}
      </div>

      <div className="flex flex-col items-center gap-3">
        <p className={seccionCls}>¿Qué destacarías?</p>
        <div className="flex flex-wrap justify-center gap-2">
          {aspectos.map((a) => {
            const activo = elegidos.includes(a);
            return (
              <button
                key={a}
                type="button"
                aria-pressed={activo}
                disabled={pendiente}
                onClick={() => alternar(a)}
                className={`h-11 rounded-full px-4.5 text-[15px] transition-colors disabled:opacity-50 ${
                  activo
                    ? "bg-acento font-semibold text-white"
                    : "border-[1.5px] border-borde bg-white font-medium text-tinta hover:bg-crema"
                }`}
              >
                {a}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`comentario-${tripId}`} className="sr-only">
          Comentario
        </label>
        <textarea
          id={`comentario-${tripId}`}
          value={comentario}
          onChange={(e) => setComentario(e.target.value.slice(0, MAX_COMENTARIO))}
          disabled={pendiente}
          rows={3}
          placeholder="Dejá un comentario (opcional)"
          className="w-full resize-none rounded-[14px] border-[1.5px] border-borde bg-white px-4 py-3 text-base outline-none placeholder:text-tenue/80 focus:border-acento focus:ring-4 focus:ring-acento-suave disabled:opacity-50"
        />
        <p className="text-right text-xs text-tenue">
          {comentario.length}/{MAX_COMENTARIO}
        </p>
      </div>

      {error && <MensajeError>{error}</MensajeError>}

      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={enviar}
          disabled={estrellas === 0 || pendiente}
          className={btnPrimario}
        >
          {pendiente ? "Enviando…" : "Enviar calificación"}
        </button>
        <button
          type="button"
          onClick={onCerrar}
          disabled={pendiente}
          className="h-11 text-[15px] font-semibold text-tinta-suave underline-offset-2 hover:underline disabled:opacity-50"
        >
          Omitir
        </button>
      </div>
    </div>
  );
}
