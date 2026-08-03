import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";

/**
 * Helpers compartilhados de validação e tratamento de erro para rotas de API.
 *
 * Regras do projeto (CLAUDE.md):
 * - Toda rota valida o payload com Zod antes de processar.
 * - Payload inválido → 400 com mensagem clara.
 * - Nenhuma exceção não capturada estoura a rota; erro é logado com contexto
 *   (rota, resumo do payload sem dado sensível, timestamp) e vira resposta HTTP.
 */

export interface ContextoErro {
  /** Rota onde o erro ocorreu (ex: "POST /api/webhooks/asaas"). */
  rota: string;
  /** Resumo do payload SEM dados sensíveis (só chaves, tipo de evento, etc). */
  resumo?: Record<string, unknown>;
}

/** Resultado da validação: sucesso com dados tipados ou resposta 400 pronta. */
export type ResultadoValidacao<T> =
  { ok: true; data: T } | { ok: false; resposta: NextResponse };

/**
 * Faz o parse do corpo JSON da requisição contra um schema Zod.
 * Em caso de JSON inválido ou payload fora do schema, devolve uma resposta 400.
 */
export async function validarCorpo<T>(
  request: Request,
  schema: ZodSchema<T>,
  contexto: ContextoErro,
): Promise<ResultadoValidacao<T>> {
  return validarJson(await request.text(), schema, contexto);
}

/**
 * Valida uma string JÁ LIDA (raw body) contra um schema Zod. Útil quando a
 * rota precisa do corpo cru antes de validar (ex.: conferir assinatura HMAC).
 * JSON inválido ou fora do schema → resposta 400 pronta.
 */
export function validarJson<T>(
  texto: string,
  schema: ZodSchema<T>,
  contexto: ContextoErro,
): ResultadoValidacao<T> {
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    logarErro(new Error("Corpo não é JSON válido"), contexto);
    return {
      ok: false,
      resposta: NextResponse.json(
        { erro: "Corpo da requisição precisa ser JSON válido." },
        { status: 400 },
      ),
    };
  }

  const resultado = schema.safeParse(bruto);
  if (!resultado.success) {
    return {
      ok: false,
      resposta: NextResponse.json(
        {
          erro: "Payload inválido.",
          detalhes: formatarErrosZod(resultado.error),
        },
        { status: 400 },
      ),
    };
  }

  return { ok: true, data: resultado.data };
}

/** Loga um erro com contexto padronizado (rota, resumo, timestamp). */
export function logarErro(erro: unknown, contexto: ContextoErro): void {
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  console.error(
    JSON.stringify({
      nivel: "error",
      timestamp: new Date().toISOString(),
      rota: contexto.rota,
      resumo: contexto.resumo ?? {},
      erro: mensagem,
    }),
  );
}

/**
 * Envolve o handler de uma rota garantindo que nenhuma exceção escape.
 * Loga o erro com contexto e devolve 500 com mensagem genérica.
 */
export async function comTratamentoDeErro(
  contexto: ContextoErro,
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await handler();
  } catch (erro) {
    logarErro(erro, contexto);
    return NextResponse.json(
      { erro: "Erro interno ao processar a requisição." },
      { status: 500 },
    );
  }
}

/** Converte um ZodError em uma lista enxuta de { campo, mensagem }. */
function formatarErrosZod(erro: ZodError): Array<{ campo: string; mensagem: string }> {
  return erro.issues.map((issue) => ({
    campo: issue.path.join(".") || "(raiz)",
    mensagem: issue.message,
  }));
}
