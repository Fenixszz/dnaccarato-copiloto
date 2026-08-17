/**
 * Provisiona os usuários do dashboard (Adriana e João).
 *
 * Cadastro é FECHADO: os dois usuários são criados aqui via Admin API
 * (service_role), com e-mail já confirmado. Não existe tela de auto-cadastro.
 *
 * Uso:  npm run seed:usuarios
 * Requer no .env:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   EMAIL_ADRIANA, EMAIL_JOAO, SEED_SENHA_ADRIANA, SEED_SENHA_JOAO
 *
 * É idempotente: se o usuário já existe, apenas atualiza a senha e reconfirma
 * o e-mail; senão, cria. A senha vem SEMPRE de variável de ambiente (nunca
 * hardcoded).
 */
import "dotenv/config";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { requireEnv } from "../lib/env";
import { normalizarEmail } from "../lib/auth/allowlist";

function getAdmin(): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** Procura um usuário pelo e-mail percorrendo as páginas da Admin API. */
async function encontrarPorEmail(
  admin: SupabaseClient,
  email: string,
): Promise<User | null> {
  const perPage = 200;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Falha ao listar usuários: ${error.message}`);

    const achado = data.users.find((u) => normalizarEmail(u.email ?? "") === email);
    if (achado) return achado;

    if (data.users.length < perPage) break; // última página
  }
  return null;
}

async function garantirUsuario(
  admin: SupabaseClient,
  emailBruto: string,
  senha: string,
  nome: string,
): Promise<void> {
  const email = normalizarEmail(emailBruto);
  const existente = await encontrarPorEmail(admin, email);

  if (existente) {
    const { error } = await admin.auth.admin.updateUserById(existente.id, {
      password: senha,
      email_confirm: true,
    });
    if (error) throw new Error(`Falha ao atualizar ${email}: ${error.message}`);
    console.log(`↻ Usuário atualizado: ${email}`);
    return;
  }

  const { error } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
  });
  if (error) throw new Error(`Falha ao criar ${email}: ${error.message}`);
  console.log(`✓ Usuário criado: ${email}`);
}

async function main(): Promise<void> {
  const admin = getAdmin();

  await garantirUsuario(
    admin,
    requireEnv("EMAIL_ADRIANA"),
    requireEnv("SEED_SENHA_ADRIANA"),
    "Adriana",
  );
  await garantirUsuario(
    admin,
    requireEnv("EMAIL_JOAO"),
    requireEnv("SEED_SENHA_JOAO"),
    "João",
  );

  console.log("✅ Usuários do dashboard prontos (2).");
}

main().catch((erro: unknown) => {
  console.error("❌ seed:usuarios falhou:", erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
