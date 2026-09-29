"use client";

import { useId, useMemo, useState, type ChangeEvent } from "react";
import { buscarLugares, debounce, type Place } from "@/lib/geocode";
import { IconoPin } from "@/components/iconos";

// Campo de dirección con autocompletado acotado a Rosario. Las sugerencias se
// listan debajo del campo (no flotando) porque vive dentro del panel inferior:
// una lista flotante quedaría fuera de la pantalla.
// Para reflejar un lugar elegido desde afuera (p. ej. el GPS), el padre lo
// remonta con una `key` nueva y `valorInicial`.
export default function BuscadorDireccion({
  etiqueta,
  marcador,
  placeholder,
  valorInicial = "",
  onSelect,
}: {
  etiqueta: string;
  marcador: "origen" | "destino";
  placeholder: string;
  valorInicial?: string;
  onSelect: (place: Place) => void;
}) {
  const id = useId();
  const [texto, setTexto] = useState(valorInicial);
  const [sugerencias, setSugerencias] = useState<Place[]>([]);
  const [abierto, setAbierto] = useState(false);

  const buscar = useMemo(
    () =>
      debounce(async (q: string) => {
        setSugerencias(await buscarLugares(q));
        setAbierto(true);
      }, 350),
    [],
  );

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setTexto(v);
    if (v.trim().length < 3) {
      setSugerencias([]);
      setAbierto(false);
      return;
    }
    buscar(v);
  }

  function elegir(p: Place) {
    onSelect(p);
    setTexto(p.label);
    setSugerencias([]);
    setAbierto(false);
  }

  const listaId = `${id}-sugerencias`;
  const mostrarLista = abierto && sugerencias.length > 0;

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="flex h-14 items-center gap-3 rounded-[14px] border-[1.5px] border-transparent bg-crema px-4 transition-colors focus-within:border-acento focus-within:bg-white focus-within:ring-4 focus-within:ring-acento-suave"
      >
        <span
          aria-hidden
          className={
            marcador === "origen"
              ? "size-3 shrink-0 rounded-full border-[3px] border-acento"
              : "size-3 shrink-0 rounded-[3px] bg-tinta"
          }
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs text-tenue">{etiqueta}</span>
          <input
            id={id}
            type="text"
            value={texto}
            onChange={onChange}
            placeholder={placeholder}
            autoComplete="off"
            aria-autocomplete="list"
            aria-controls={mostrarLista ? listaId : undefined}
            aria-expanded={mostrarLista}
            role="combobox"
            className="w-full truncate bg-transparent text-base font-semibold text-tinta outline-none placeholder:font-normal placeholder:text-tenue/80"
          />
        </span>
      </label>
      {mostrarLista && (
        <ul
          id={listaId}
          role="listbox"
          aria-label={`Sugerencias de ${etiqueta.toLowerCase()}`}
          className="flex max-h-60 flex-col overflow-auto rounded-[14px] border border-linea bg-white"
        >
          {sugerencias.map((s, i) => (
            <li key={`${s.lat},${s.lng},${i}`} role="option" aria-selected={false}>
              <button
                type="button"
                onClick={() => elegir(s)}
                className="flex min-h-12 w-full items-center gap-3 border-b border-linea px-4 py-2.5 text-left text-[15px] last:border-b-0 hover:bg-crema"
              >
                <IconoPin className="size-[18px] shrink-0 text-tenue" />
                <span className="min-w-0">{s.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
