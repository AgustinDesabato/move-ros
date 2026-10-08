import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfil } from "@/lib/perfil";
import { getFavoritos } from "@/app/actions/favoritos";
import { BarraSuperior } from "@/components/ui";
import FavoritosForm from "./favoritos-form";

// Lugares favoritos del pasajero logueado (Spec 26). Sólo el pasajero los
// usa (en P04), así que cualquier otro rol vuelve a su perfil.
export default async function FavoritosPage() {
  const supabase = await createClient();
  const { profile } = await getPerfil(supabase);
  if (!profile) redirect("/login");
  if (profile.role !== "pasajero") redirect("/perfil");

  const favoritos = await getFavoritos();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <BarraSuperior titulo="Lugares favoritos" volverHref="/perfil" />
      <FavoritosForm favoritos={favoritos} />
    </main>
  );
}
