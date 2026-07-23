import { criarSupabaseServidor } from "@/lib/supabase/servidor";
import { BotaoSair } from "./sair";

// Área administrativa. O acesso é garantido pelo proxy.ts (Supabase Auth +
// allowlist); aqui só montamos o chrome e mostramos quem está logado.
export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await criarSupabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-4 border-b p-4">
        <h1 className="font-semibold">Copiloto Dnaccarato — área administrativa</h1>
        <div className="flex items-center gap-3">
          {user?.email && <span className="text-sm text-neutral-500">{user.email}</span>}
          <BotaoSair />
        </div>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
