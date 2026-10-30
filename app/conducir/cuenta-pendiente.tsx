import Link from "next/link";
import { IconoMenu } from "@/components/iconos";
import { Avatar, BarraSuperior, tituloCls } from "@/components/ui";

// Spec 35 · Lo que ve en /conducir un conductor que soporte todavía no aprobó:
// sin switch "En línea" ni ofertas, porque el despacho no lo elige hasta que
// lo aprueben. Al recargar después de la aprobación ve el panel normal.
export default function CuentaPendiente({ nombre }: { nombre: string }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <BarraSuperior
        titulo="Conducir"
        izquierda={
          <Link
            href="/perfil"
            aria-label="Menú de usuario"
            className="flex size-11 items-center justify-center rounded-full text-tinta transition-colors hover:bg-black/5"
          >
            <IconoMenu />
          </Link>
        }
        derecha={
          <Link href="/perfil" aria-label="Mi perfil" className="rounded-full">
            <Avatar nombre={nombre} />
          </Link>
        }
      />

      <div className="flex flex-1 flex-col gap-4 px-5 pt-6 pb-8">
        <h2 className={tituloCls}>Hola, {nombre.split(" ")[0]}</h2>
        <div role="status" className="rounded-[20px] bg-aviso-suave p-4 text-aviso">
          <p className="font-bold">Tu cuenta está pendiente de aprobación.</p>
          <p className="mt-1 text-sm">
            Soporte la va a revisar pronto. Hasta entonces no vas a recibir viajes.
          </p>
        </div>
      </div>
    </main>
  );
}
