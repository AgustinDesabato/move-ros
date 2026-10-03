import Link from "next/link";
import { Logo, btnPrimario, btnSecundario } from "@/components/ui";

// P01 · Bienvenida: primera pantalla para quien no tiene sesión.
export default function BienvenidaPage() {
  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-hidden px-6 pb-10">
      {/* Trama de calles de fondo, sólo decorativa. */}
      <svg
        aria-hidden
        viewBox="0 0 390 440"
        preserveAspectRatio="xMidYMin slice"
        className="pointer-events-none absolute inset-x-0 top-0 h-[440px] w-full"
      >
        <defs>
          <linearGradient id="bienvenida-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f4f2ec" stopOpacity="0" />
            <stop offset="1" stopColor="#f4f2ec" />
          </linearGradient>
        </defs>
        <path
          d="M0 56H390 M0 120H390 M0 184H390 M0 248H390 M0 376H390 M20 0V440 M78 0V440 M136 0V440 M252 0V440 M310 0V440"
          stroke="#e6e2d8"
          strokeWidth="3"
          fill="none"
        />
        <path
          d="M0 312H390 M194 0V440 M0 440 L390 60"
          stroke="#e6e2d8"
          strokeWidth="8"
          fill="none"
        />
        <rect x="0" y="300" width="390" height="140" fill="url(#bienvenida-fade)" />
      </svg>

      <div className="relative flex flex-1 flex-col items-center justify-center gap-5 py-12 text-center">
        <Logo />
        <h1 className="font-display text-5xl font-bold tracking-[-0.03em]">
          Move Ros
        </h1>
        <p className="text-[17px] leading-snug text-tenue">
          Movilidad urbana para Rosario
          <br />y alrededores
        </p>
      </div>

      <div className="relative flex flex-col gap-3">
        <Link href="/login" className={btnPrimario}>
          Iniciar sesión
        </Link>
        <Link href="/registro" className={btnSecundario}>
          Crear cuenta
        </Link>
        <p className="mt-3 text-center text-sm text-tenue">
          Pasajeros · Conductores · Remiserías
        </p>
      </div>
    </main>
  );
}
