"use client";

import { useRouter } from "next/navigation";
import { IconoVolver } from "@/components/iconos";

// Vuelve a la pantalla anterior: al perfil público se llega desde varios
// lugares (viaje en curso, oferta, detalle del viaje, remisería, perfil
// propio), así que no hay un destino fijo (Spec 29).
export default function BotonVolver() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      aria-label="Volver"
      className="flex size-11 items-center justify-center rounded-full text-tinta transition-colors hover:bg-black/5"
    >
      <IconoVolver />
    </button>
  );
}
