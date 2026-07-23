// Allowlist de quem pode acessar o dashboard (Adriana e o dono do projeto).
// A lista vem de DASHBOARD_EMAILS_PERMITIDOS (emails separados por vírgula);
// a comparação ignora caixa e espaços. É o gate de autorização — a
// autenticação em si é do Supabase Auth.

export function listaDeEmailsPermitidos(): string[] {
  return (process.env.DASHBOARD_EMAILS_PERMITIDOS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email !== "");
}

export function emailPermitido(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }
  return listaDeEmailsPermitidos().includes(email.trim().toLowerCase());
}
