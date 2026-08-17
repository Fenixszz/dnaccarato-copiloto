import { registrarAuditoria } from "@/lib/db/queries";
import { ErroFerramenta, type FerramentaMcp } from "@/lib/mcp/tools";
import type { Json } from "@/lib/db/types";

/**
 * Resultado estruturado da execução de uma ferramenta. Nunca relança: quem
 * chama decide como responder (JSON-RPC na rota MCP, mensagem na tela).
 */
export interface ResultadoExecucao {
  ok: boolean;
  /** Retorno da ferramenta (quando ok). */
  resultado?: unknown;
  /** Mensagem de negócio SEGURA (ErroFerramenta) — pode ir para o usuário. */
  erroNegocio?: string;
  /** Erro interno cru (não-ErroFerramenta), para log — nunca exposto ao usuário. */
  erroInterno?: unknown;
}

/**
 * Executa uma ferramenta JÁ VALIDADA (args conforme `argsSchema`) e registra a
 * auditoria (sucesso/erro) com a origem informada.
 *
 * É o ponto único de "executar tool + auditar", reaproveitado pela rota MCP
 * (origem "mcp") e pelas ações rápidas do dashboard (origem "dashboard"),
 * garantindo que TODA ação de escrita seja auditada do mesmo jeito (CLAUDE.md).
 */
export async function executarFerramentaAuditada(opts: {
  ferramenta: FerramentaMcp;
  /** Argumentos já validados pelo argsSchema da ferramenta. */
  args: unknown;
  origem: "mcp" | "dashboard";
  /** Aluna afetada (para a coluna aluna_id da auditoria). */
  alunaId?: string;
  /** Detalhes-base da auditoria (ex.: token_id no MCP, "por" no dashboard). */
  detalhesBase?: Record<string, Json>;
}): Promise<ResultadoExecucao> {
  const { ferramenta, args, origem, alunaId, detalhesBase = {} } = opts;

  try {
    const resultado = await ferramenta.executar(args);
    await registrarAuditoria({
      origem,
      acao: ferramenta.name,
      alunaId,
      resultado: "sucesso",
      detalhes: {
        ...detalhesBase,
        ...(ferramenta.resumoAuditoria?.(args, resultado) ?? {}),
      },
    });
    return { ok: true, resultado };
  } catch (erro) {
    await registrarAuditoria({
      origem,
      acao: ferramenta.name,
      alunaId,
      resultado: "erro",
      detalhes: detalhesBase,
    });
    if (erro instanceof ErroFerramenta) {
      return { ok: false, erroNegocio: erro.message };
    }
    return { ok: false, erroInterno: erro };
  }
}
