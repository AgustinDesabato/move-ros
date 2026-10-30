import { ImageResponse } from "next/og";

// Mismo trazo que components/ui.tsx#Logo, el único logo definido hoy
// (Spec 36: el diseño final queda pendiente). No hay herramienta de rasterizado
// disponible en este entorno, así que el PNG 180×180 se genera con
// ImageResponse en vez de un archivo estático: el resultado es el mismo
// <link rel="apple-touch-icon">.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1d4ed8",
        }}
      >
        <svg
          width="130"
          height="130"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#ffffff"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="6" cy="18" r="2.5" />
          <path d="M8.5 18H14a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6" />
          <rect x="16" y="3.5" width="5" height="5" rx="1" fill="#ffffff" stroke="none" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
