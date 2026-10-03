import { BarraSuperior } from "@/components/ui";
import RecuperarForm from "./recuperar-form";

// P02 · Recuperar contraseña: primer paso del flujo (pedir el link).
// Accesible sin sesión (ver lib/supabase/proxy.ts).
export default async function RecuperarPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <BarraSuperior titulo="Recuperar contraseña" volverHref="/login" />
      <RecuperarForm errorLink={error === "link_invalido"} />
    </main>
  );
}
