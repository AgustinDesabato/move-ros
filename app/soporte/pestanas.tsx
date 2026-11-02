import Link from "next/link";

export type SeccionSoporte = "reclamos" | "alertas" | "usuarios" | "viajes";

const SECCIONES: { id: SeccionSoporte; href: string; texto: string }[] = [
  { id: "reclamos", href: "/soporte", texto: "Reclamos" },
  { id: "alertas", href: "/soporte/alertas", texto: "Alertas" },
  { id: "usuarios", href: "/soporte/usuarios", texto: "Usuarios" },
  { id: "viajes", href: "/soporte/viajes", texto: "Viajes" },
];

// Pestañas entre las secciones del panel de soporte (Spec 22/23/35).
export default function Pestanas({ activa }: { activa: SeccionSoporte }) {
  const base =
    "flex h-10 items-center justify-center rounded-[10px] text-[14px] transition-colors focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none";
  const on = "bg-white font-bold text-acento shadow-[0_1px_3px_rgba(21,23,28,0.15)]";
  const off = "font-medium text-tinta-suave hover:bg-white/50";
  return (
    <nav
      aria-label="Secciones de soporte"
      className="grid grid-cols-4 gap-1 rounded-[14px] bg-crema-oscuro p-1"
    >
      {SECCIONES.map((s) => (
        <Link
          key={s.id}
          href={s.href}
          aria-current={activa === s.id ? "page" : undefined}
          className={`${base} ${activa === s.id ? on : off}`}
        >
          {s.texto}
        </Link>
      ))}
    </nav>
  );
}
