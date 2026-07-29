/**
 * Acesso centralizado às variáveis de ambiente.
 *
 * Regra do projeto (CLAUDE.md): nenhuma credencial hardcoded — tudo vem de
 * variável de ambiente. Este módulo é o único ponto que lê `process.env` para
 * segredos de servidor, garantindo erro cedo e claro quando algo falta.
 */

/** Lê uma variável obrigatória; lança erro explícito se ausente. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(
      `Variável de ambiente obrigatória ausente: ${name}. ` +
        `Confira o .env.example e configure o .env.`,
    );
  }
  return value;
}

/** Lê uma variável opcional, com fallback. */
export function optionalEnv(name: string, fallback = ""): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}
