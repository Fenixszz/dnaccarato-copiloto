/**
 * Allowlist de acesso ao dashboard.
 *
 * Cadastro é FECHADO: só a Adriana e o João entram, ambos definidos por
 * variável de ambiente — nunca por auto-cadastro. `EMAIL_ADRIANA` já existe
 * (impersonation do Google Workspace); é o mesmo e-mail dela. `EMAIL_JOAO` é
 * novo. Toda a lógica é pura e testável (comparação normalizada de e-mail).
 */
import { requireEnv } from "@/lib/env";

/** Normaliza um e-mail para comparação: remove espaços e força minúsculas. */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** E-mails autorizados a acessar o dashboard (Adriana e João). */
export function emailsPermitidos(): string[] {
  return [requireEnv("EMAIL_ADRIANA"), requireEnv("EMAIL_JOAO")].map(normalizarEmail);
}

/**
 * Diz se um e-mail está na allowlist do dashboard. Aceita null/undefined
 * (usuário sem e-mail) e retorna false, para uso direto com `user.email`.
 */
export function emailPermitido(email: string | null | undefined): boolean {
  if (email === null || email === undefined || email === "") return false;
  return emailsPermitidos().includes(normalizarEmail(email));
}
