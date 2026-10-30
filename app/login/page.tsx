import { MENSAJE_SUSPENDIDA } from "@/lib/perfil";
import LoginForm from "./login-form";

// P02 · Inicio de sesión. ?suspendida=1 llega desde /auth/suspendida, cuando
// soporte suspendió una cuenta con la sesión abierta (Spec 35).
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ suspendida?: string }>;
}) {
  const { suspendida } = await searchParams;
  return <LoginForm aviso={suspendida === "1" ? MENSAJE_SUSPENDIDA : null} />;
}
