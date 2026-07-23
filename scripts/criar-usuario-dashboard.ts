// Cria um usuário do dashboard no Supabase Auth (email já confirmado).
//
// Uso: npm run auth:usuario -- <email> <senha>
// Ex.: npm run auth:usuario -- adriana@example.com "senha-forte-aqui"
//
// Depois de criar, adicione o email em DASHBOARD_EMAILS_PERMITIDOS
// (.env.local e Vercel) — só quem está na allowlist consegue entrar.
import { createClient } from "@supabase/supabase-js";

async function main(): Promise<void> {
  const email = process.argv[2];
  const senha = process.argv[3];
  if (!email || !senha) {
    throw new Error("Uso: npm run auth:usuario -- <email> <senha>");
  }

  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar no .env.local");
  }

  const supabase = createClient(url, chave, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await supabase.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });
  if (error) {
    throw new Error(`Falha ao criar usuário: ${error.message}`);
  }

  console.log(`Usuário ${email} criado.`);
  console.log("Agora adicione esse email em DASHBOARD_EMAILS_PERMITIDOS (.env.local e Vercel).");
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : String(erro));
  process.exit(1);
});
