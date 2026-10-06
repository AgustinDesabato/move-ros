import { useCallback, useEffect, useRef, useState } from "react";
import { TIMEOUT_MAPA_MS } from "@/lib/mapa";

export type MotorMapa = "vectorial" | "leaflet";

// Una vez que se cayó al respaldo, el resto de la carga de página usa Leaflet
// sin volver a esperar el timeout. Recargar la página lo reinicia.
let respaldoActivo = false;

function hayWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

// Decide qué motor dibuja el mapa (Spec 18): el vectorial (MapLibre) y, si no
// hay WebGL, falla antes de cargar o no carga a tiempo, el respaldo Leaflet.
// Sólo se usa en componentes cargados sin SSR (lee `document` al montar).
export function useMotorMapa() {
  const [motor, setMotor] = useState<MotorMapa>(() =>
    respaldoActivo || !hayWebGL() ? "leaflet" : "vectorial",
  );
  const cargado = useRef(false);

  const pasarARespaldo = useCallback(() => {
    if (cargado.current) return;
    respaldoActivo = true;
    setMotor("leaflet");
  }, []);

  // El timeout sólo corre con la pestaña visible: en segundo plano el navegador
  // no dibuja, MapLibre no llega a emitir `load` y se caería al respaldo sin
  // que el proveedor tenga ningún problema.
  useEffect(() => {
    if (motor !== "vectorial") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reprogramar = () => {
      clearTimeout(timer);
      if (!document.hidden) timer = setTimeout(pasarARespaldo, TIMEOUT_MAPA_MS);
    };
    reprogramar();
    document.addEventListener("visibilitychange", reprogramar);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", reprogramar);
    };
  }, [motor, pasarARespaldo]);

  // El mapa vectorial emitió `load`: ya no se cae al respaldo.
  const alCargar = useCallback(() => {
    cargado.current = true;
  }, []);

  return { motor, alCargar, alFallar: pasarARespaldo };
}
