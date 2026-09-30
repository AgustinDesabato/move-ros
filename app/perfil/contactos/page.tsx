import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContactos } from "@/app/actions/seguridad";
import { BarraSuperior } from "@/components/ui";
import ContactosForm from "./contactos-form";

// Contactos de confianza del usuario logueado (Spec 12).
export default async function ContactosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const contactos = await getContactos();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <BarraSuperior titulo="Contactos de confianza" volverHref="/perfil" />
      <ContactosForm contactos={contactos} />
    </main>
  );
}
