import Link from "next/link";
import { IconoChevron, IconoLlave } from "@/components/iconos";
import { BarraSuperior } from "@/components/ui";
import CerrarSesiones from "./cerrar-sesiones";

// Configuración de la cuenta (Spec 32): cambiar la contraseña y cerrar la
// sesión en todos los dispositivos. Vuelve con ?aviso=contrasena después de un
// cambio de contraseña exitoso.
export default async function ConfiguracionPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { aviso } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <BarraSuperior titulo="Configuración" volverHref="/perfil" />

      <div className="flex flex-1 flex-col gap-5 px-5 pt-3 pb-8">
        {aviso === "contrasena" && (
          <p
            role="status"
            className="rounded-[14px] bg-exito-suave px-4 py-3 text-sm font-medium text-exito"
          >
            Cambiaste tu contraseña. Cerramos tu sesión en los otros dispositivos.
          </p>
        )}

        <ul className="overflow-hidden rounded-[20px] bg-white">
          <li>
            <Link
              href="/perfil/configuracion/contrasena"
              className="flex min-h-15 items-center gap-3.5 border-b border-linea px-4 transition-colors hover:bg-crema/60"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-crema">
                <IconoLlave />
              </span>
              <span className="flex-1 text-base font-medium">Cambiar contraseña</span>
              <IconoChevron className="size-[18px] text-tenue" />
            </Link>
          </li>
          <CerrarSesiones />
        </ul>
      </div>
    </main>
  );
}
