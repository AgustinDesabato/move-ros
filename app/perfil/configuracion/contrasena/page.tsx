import { BarraSuperior } from "@/components/ui";
import ContrasenaForm from "./contrasena-form";

// Cambiar la contraseña estando logueado (Spec 32). La sesión la exige el
// proxy y la vuelve a chequear la action.
export default function ContrasenaPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <BarraSuperior titulo="Cambiar contraseña" volverHref="/perfil/configuracion" />
      <ContrasenaForm />
    </main>
  );
}
