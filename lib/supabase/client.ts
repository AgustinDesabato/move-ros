import { createBrowserClient } from "@supabase/ssr";

// Cliente de Supabase para usar en el navegador (Client Components).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
