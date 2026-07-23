import { redirect } from "next/navigation";
import { emailPermitido } from "@/lib/auth/emails-permitidos";
import { criarSupabaseServidor } from "@/lib/supabase/servidor";
import { FormularioLogin } from "./formulario-login";

// Tela de login. Fica FORA do grupo (dashboard), então não é protegida pelo
// proxy nem herda o chrome administrativo. Quem já está logado e autorizado é
// mandado direto pro painel.
export default async function PaginaLogin() {
  const supabase = await criarSupabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (emailPermitido(user?.email)) {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <div className="text-center">
        <h1 className="text-lg font-semibold">Copiloto Dnaccarato</h1>
        <p className="text-sm text-neutral-500">Entre para acessar o painel.</p>
      </div>
      <FormularioLogin />
    </main>
  );
}
