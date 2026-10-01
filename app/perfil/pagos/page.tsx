import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfil } from "@/lib/perfil";
import { getAliasCvu } from "@/app/actions/pagos-transferencia";
import { getMiEmpresa } from "@/app/actions/invitaciones";
import { BarraSuperior } from "@/components/ui";
import PagosForm from "./pagos-form";

// Datos de cobro por transferencia del conductor o la remisería (Spec 15). El
// pasajero no cobra: no tiene nada que cargar acá.
export default async function PagosPage() {
  const supabase = await createClient();
  const { profile } = await getPerfil(supabase);
  if (!profile) redirect("/login");
  if (profile.role === "pasajero") redirect("/perfil");

  const [alias, empresaNombre] = await Promise.all([
    getAliasCvu(),
    profile.role === "conductor" ? getMiEmpresa() : null,
  ]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <BarraSuperior titulo="Métodos de pago" volverHref="/perfil" />
      <PagosForm alias={alias} empresaNombre={empresaNombre} />
    </main>
  );
}
