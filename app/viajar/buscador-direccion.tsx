"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import {
  buscarLugares,
  debounce,
  reverseGeocode,
  type Place,
} from "@/lib/geocode";

const inputCls =
  "w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-base outline-none focus:border-black dark:border-white/20 dark:focus:border-white";

export default function BuscadorDireccion({
  placeholder,
  onSelect,
  conUbicacion = false,
}: {
  placeholder: string;
  onSelect: (place: Place) => void;
  conUbicacion?: boolean;
}) {
  const [texto, setTexto] = useState("");
  const [sugerencias, setSugerencias] = useState<Place[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [cargandoUbi, setCargandoUbi] = useState(false);

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

  function usarUbicacion() {
    if (!navigator.geolocation) return;
    setCargandoUbi(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const p = await reverseGeocode(latitude, longitude);
        elegir(
          p ?? { lat: latitude, lng: longitude, label: "Mi ubicación actual" },
        );
        setCargandoUbi(false);
      },
      () => setCargandoUbi(false),
    );
  }

  return (
    <div className="relative flex flex-col gap-1">
      <input
        type="text"
        value={texto}
        onChange={onChange}
        placeholder={placeholder}
        className={inputCls}
        autoComplete="off"
      />
      {conUbicacion && (
        <button
          type="button"
          onClick={usarUbicacion}
          disabled={cargandoUbi}
          className="self-start text-sm font-medium text-zinc-600 underline disabled:opacity-50 dark:text-zinc-400"
        >
          {cargandoUbi ? "Buscando tu ubicación…" : "Usar mi ubicación actual"}
        </button>
      )}
      {abierto && sugerencias.length > 0 && (
        <ul className="absolute top-full z-[1000] mt-1 max-h-60 w-full overflow-auto rounded-lg border border-black/10 bg-white shadow-lg dark:border-white/15 dark:bg-zinc-950">
          {sugerencias.map((s, i) => (
            <li key={`${s.lat},${s.lng},${i}`}>
              <button
                type="button"
                onClick={() => elegir(s)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10"
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
