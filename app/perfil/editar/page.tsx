import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, perfilCompleto } from "@/lib/perfil";
import PerfilForm from "../perfil-form";

// Edición del perfil (y alta del vehículo del conductor). Es también el paso
// obligatorio para quien todavía no completó sus datos.
export default async function EditarPerfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { profile, vehicle } = await getPerfil(supabase);
  if (!user || !profile) redirect("/login");

  // Si se registró con confirmación de email, nombre y teléfono quedaron en la
  // metadata de la cuenta: se usan para precargar el formulario.
  const meta = user.user_metadata as { nombre?: unknown; telefono?: unknown };
  const sugerido = {
    nombre: typeof meta.nombre === "string" ? meta.nombre : "",
    telefono: typeof meta.telefono === "string" ? meta.telefono : "",
  };

  return (
    <PerfilForm
      profile={profile}
      vehicle={vehicle}
      completo={perfilCompleto(profile, vehicle)}
      sugerido={sugerido}
    />
  );
}
