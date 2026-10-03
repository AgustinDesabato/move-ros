// Íconos de trazo (24×24) usados en toda la app. Son decorativos: el texto o el
// aria-label del control que los contiene es lo que se anuncia.

type Props = { className?: string };

const trazo = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export function IconoMenu({ className = "size-[22px]" }: Props) {
  return (
    <svg {...trazo} className={className}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function IconoVolver({ className = "size-[22px]" }: Props) {
  return (
    <svg {...trazo} strokeWidth={2.2} className={className}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function IconoChevron({ className = "size-[18px]" }: Props) {
  return (
    <svg {...trazo} strokeWidth={2.2} className={className}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function IconoUbicacion({ className = "size-[22px]" }: Props) {
  return (
    <svg {...trazo} className={className}>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}

export function IconoPin({ className = "size-[18px]" }: Props) {
  return (
    <svg {...trazo} className={className}>
      <path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

export function IconoOjo({ className = "size-5" }: Props) {
  return (
    <svg {...trazo} className={className}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconoOjoTachado({ className = "size-5" }: Props) {
  return (
    <svg {...trazo} className={className}>
      <path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.6 3.4M6.6 6.6C3.6 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
    </svg>
  );
}

export function IconoReloj({ className = "size-5" }: Props) {
  return (
    <svg {...trazo} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function IconoBillete({ className = "size-[18px]" }: Props) {
  return (
    <svg {...trazo} className={className}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

export function IconoTarjeta({ className = "size-[18px]" }: Props) {
  return (
    <svg {...trazo} className={className}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  );
}

export function IconoCompartir({ className = "size-[18px]" }: Props) {
  return (
    <svg {...trazo} className={className}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  );
}

export function IconoAlerta({ className = "size-5" }: Props) {
  return (
    <svg {...trazo} strokeWidth={2.2} className={className}>
      <path d="M12 3l10 18H2z" />
      <path d="M12 10v5M12 18v.5" />
    </svg>
  );
}

export function IconoCheck({ className = "size-5" }: Props) {
  return (
    <svg {...trazo} strokeWidth={2.6} className={className}>
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}

export function IconoInfo({ className = "size-5" }: Props) {
  return (
    <svg {...trazo} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </svg>
  );
}

export function IconoEscudo({ className = "size-5" }: Props) {
  return (
    <svg {...trazo} className={className}>
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
    </svg>
  );
}

export function IconoMensaje({ className = "size-5" }: Props) {
  return (
    <svg {...trazo} className={className}>
      <path d="M4 5h16v11H9l-5 4z" />
    </svg>
  );
}

export function IconoAjustes({ className = "size-5" }: Props) {
  return (
    <svg {...trazo} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" />
    </svg>
  );
}

export function IconoPersona({ className = "size-5" }: Props) {
  return (
    <svg {...trazo} className={className}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </svg>
  );
}

export function IconoMas({ className = "size-5" }: Props) {
  return (
    <svg {...trazo} strokeWidth={2.4} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconoAuto({ className = "size-5" }: Props) {
  return (
    <svg {...trazo} className={className}>
      <path d="M5 16V11l2-5h10l2 5v5" />
      <path d="M3 16h18v3H3z" />
      <circle cx="7.5" cy="13" r="1" fill="currentColor" />
      <circle cx="16.5" cy="13" r="1" fill="currentColor" />
    </svg>
  );
}

export function IconoEstrella({ className = "size-9" }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.5L12 17.2l-5.9 3.2 1.3-6.5L2.5 9.3l6.6-.8z" />
    </svg>
  );
}

// SVG crudo del auto, para el divIcon de Leaflet (que recibe HTML, no JSX).
export const AUTO_SVG =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 16V11l2-5h10l2 5v5"/><path d="M3 16h18v3H3z"/></svg>';
