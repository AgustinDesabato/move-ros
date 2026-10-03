import Link from "next/link";
import type { ReactNode } from "react";
import { iniciales } from "@/lib/formato";
import { IconoVolver } from "./iconos";

// Piezas visuales compartidas por todas las pantallas. No tienen estado ni
// hooks, así que sirven tanto desde Server Components como desde Client
// Components.

export const btnPrimario =
  "flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-acento px-5 text-[17px] font-bold text-white transition-colors hover:bg-acento-oscuro focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-acento/30 disabled:cursor-not-allowed disabled:opacity-50";

export const btnSecundario =
  "flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-borde bg-white px-5 text-base font-semibold text-tinta transition-colors hover:bg-crema focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-acento/30 disabled:cursor-not-allowed disabled:opacity-50";

export const btnFlotante =
  "flex size-12 items-center justify-center rounded-2xl bg-white text-tinta shadow-[0_4px_14px_rgba(21,23,28,0.14)] transition-colors hover:bg-crema focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-acento/30";

export const inputCls =
  "h-13 w-full rounded-[14px] border-[1.5px] border-borde bg-white px-4 text-base text-tinta outline-none placeholder:text-tenue/80 focus:border-acento focus:ring-4 focus:ring-acento-suave disabled:opacity-50 aria-invalid:border-peligro aria-invalid:focus:border-peligro aria-invalid:focus:ring-peligro-suave";

export const etiquetaCls = "text-[13px] font-semibold text-tinta-suave";

export const seccionCls =
  "text-xs font-bold uppercase tracking-[0.06em] text-tenue";

export const tituloCls =
  "font-display text-[26px] font-bold leading-tight tracking-[-0.01em]";

export const enlaceCls =
  "font-semibold text-acento underline-offset-2 hover:text-acento-oscuro hover:underline";

export function Logo({
  className = "size-26 rounded-[30px]",
  iconoClassName = "size-14",
}: {
  className?: string;
  iconoClassName?: string;
}) {
  return (
    <span
      aria-hidden
      className={`flex items-center justify-center bg-acento text-white shadow-[0_12px_30px_rgba(29,78,216,0.3)] ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={iconoClassName}
      >
        <circle cx="6" cy="18" r="2.5" />
        <path d="M8.5 18H14a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6" />
        <rect x="16" y="3.5" width="5" height="5" rx="1" fill="currentColor" />
      </svg>
    </span>
  );
}

export function Avatar({
  nombre,
  neutro = false,
  className = "size-11 text-sm",
}: {
  nombre: string | null | undefined;
  neutro?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${
        neutro ? "bg-crema text-tinta" : "bg-acento-suave text-acento"
      } ${className}`}
    >
      {iniciales(nombre)}
    </span>
  );
}

// Encabezado de las pantallas sin mapa: volver (o un control propio) a la
// izquierda, título centrado y un control opcional a la derecha.
export function BarraSuperior({
  titulo,
  volverHref,
  izquierda,
  derecha,
}: {
  titulo: string;
  volverHref?: string;
  izquierda?: ReactNode;
  derecha?: ReactNode;
}) {
  return (
    <header className="grid h-16 shrink-0 grid-cols-[64px_1fr_64px] items-center pt-[env(safe-area-inset-top)]">
      <div className="flex pl-2">
        {volverHref ? (
          <Link
            href={volverHref}
            aria-label="Volver"
            className="flex size-11 items-center justify-center rounded-full text-tinta transition-colors hover:bg-black/5"
          >
            <IconoVolver />
          </Link>
        ) : (
          izquierda
        )}
      </div>
      <h1 className="text-center text-lg font-bold">{titulo}</h1>
      <div className="flex justify-end pr-2">{derecha}</div>
    </header>
  );
}

// Layout de las pantallas con mapa: el mapa ocupa todo el fondo, los controles
// flotan arriba y el panel de acciones queda abajo, al alcance del pulgar.
export function PantallaMapa({
  mapa,
  arriba,
  children,
}: {
  mapa: ReactNode;
  arriba?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-mapa">
      {/* isolate encierra los z-index de Leaflet para que no tapen los paneles. */}
      <div className="absolute inset-0 isolate">{mapa}</div>
      {arriba && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 mx-auto flex max-w-md flex-col gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))] *:pointer-events-auto">
          {arriba}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 z-10 mx-auto max-w-md">
        {children}
      </div>
    </main>
  );
}

// Panel inferior (bottom sheet) de las pantallas con mapa.
export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex max-h-[78dvh] flex-col gap-4 overflow-y-auto rounded-t-[28px] bg-white px-5 pt-2.5 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(21,23,28,0.14)] ${className}`}
    >
      <div aria-hidden className="mx-auto h-1 w-10 shrink-0 rounded-full bg-borde" />
      {children}
    </section>
  );
}

// Origen y destino unidos por una línea: círculo = origen, cuadrado = destino.
export function Recorrido({
  origen,
  destino,
  className = "bg-crema",
}: {
  origen: string;
  destino: string;
  className?: string;
}) {
  return (
    <div className={`flex gap-3 rounded-[14px] px-3.5 py-3 ${className}`}>
      <div aria-hidden className="flex w-3 shrink-0 flex-col items-center gap-1 py-1.5">
        <span className="size-2.5 rounded-full border-[3px] border-tinta" />
        <span className="w-0.5 flex-1 bg-borde" />
        <span className="size-2.5 rounded-[2px] bg-tinta" />
      </div>
      <dl className="flex min-w-0 flex-1 flex-col gap-2.5 text-[15px] font-semibold">
        <div>
          <dt className="sr-only">Origen</dt>
          <dd className="truncate">{origen}</dd>
        </div>
        <div>
          <dt className="sr-only">Destino</dt>
          <dd className="truncate">{destino}</dd>
        </div>
      </dl>
    </div>
  );
}

// Un dato numérico del viaje (distancia, duración, tarifa…).
export function Dato({
  valor,
  etiqueta,
  destacado = false,
}: {
  valor: string;
  etiqueta: string;
  destacado?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col items-center gap-0.5 rounded-[14px] px-2 py-3 text-center ${
        destacado ? "bg-acento-suave" : "border border-linea"
      }`}
    >
      <span
        className={
          destacado
            ? "font-display text-[22px] font-bold leading-tight text-acento"
            : "text-lg font-bold leading-tight"
        }
      >
        {valor}
      </span>
      <span className={`text-xs ${destacado ? "text-acento-oscuro" : "text-tenue"}`}>
        {etiqueta}
      </span>
    </div>
  );
}

// Control segmentado sobre radios nativos: funciona dentro de un <form> (sin
// estado) o controlado con value/onChange.
export function Segmentado<T extends string>({
  name,
  etiqueta,
  opciones,
  value,
  defaultValue,
  onChange,
}: {
  name: string;
  etiqueta: string;
  opciones: { valor: T; texto: string; icono?: ReactNode }[];
  value?: T;
  defaultValue?: T;
  onChange?: (v: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={etiqueta}
      className="grid gap-1 rounded-[14px] bg-crema-oscuro p-1"
      style={{ gridTemplateColumns: `repeat(${opciones.length}, minmax(0, 1fr))` }}
    >
      {opciones.map((o) => (
        <label
          key={o.valor}
          className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[10px] text-[15px] font-medium text-tinta-suave transition-colors has-checked:bg-white has-checked:font-bold has-checked:text-acento has-checked:shadow-[0_1px_3px_rgba(21,23,28,0.15)] has-focus-visible:ring-2 has-focus-visible:ring-acento"
        >
          <input
            type="radio"
            name={name}
            value={o.valor}
            className="sr-only"
            {...(value !== undefined
              ? { checked: value === o.valor, onChange: () => onChange?.(o.valor) }
              : { defaultChecked: defaultValue === o.valor })}
          />
          {o.icono}
          {o.texto}
        </label>
      ))}
    </div>
  );
}

export function MensajeError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm font-medium text-peligro">
      {children}
    </p>
  );
}

// Mensaje de error debajo de un campo (Spec 19). Es un <span> porque suele ir
// dentro del <label> del campo, que no admite <p>. El input lo referencia con
// aria-describedby={id} y lleva aria-invalid, que además pinta el borde de
// error de inputCls.
export function ErrorCampo({ id, children }: { id: string; children: ReactNode }) {
  return (
    <span id={id} className="text-[13px] font-medium text-peligro">
      {children}
    </span>
  );
}

// Props de accesibilidad de un input según tenga o no error. El id del
// mensaje es `${name}-error`.
export function ariaCampo(name: string, error: string | undefined) {
  return error
    ? { "aria-invalid": true as const, "aria-describedby": `${name}-error` }
    : {};
}
