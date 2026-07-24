import type { ResultadoEscrita } from "@/lib/acoes/escrita";
import { registrarAuditoria, type Ator } from "@/lib/auditoria";
import { registrarErroDeRota } from "@/lib/log";

// Executa uma ação de escrita e SEMPRE audita (sucesso, recusa ou erro). Se a
// gravação da auditoria falhar, retorna "sem_auditoria" — quem chama trata
// como erro (nada é dado como concluído sem rastro). Núcleo compartilhado
// entre as tools MCP e as ações do dashboard.
export type DesfechoAcao =
  | { status: "ok"; mensagem: string; dados: Record<string, unknown> }
  | { status: "recusado"; mensagem: string }
  | { status: "erro" }
  | { status: "sem_auditoria" };

export async function executarComAuditoria(
  ator: Ator,
  acao: string,
  alunaId: string | null,
  nucleo: () => Promise<ResultadoEscrita>
): Promise<DesfechoAcao> {
  let resultadoAuditoria: string;
  let alunaAuditoria: string | null;
  let desfecho: DesfechoAcao;

  try {
    const saida = await nucleo();
    resultadoAuditoria = saida.resultado;
    alunaAuditoria = saida.alunaIdAuditoria;
    desfecho =
      saida.status === "sucesso"
        ? { status: "ok", mensagem: saida.mensagem, dados: saida.dados }
        : { status: "recusado", mensagem: saida.mensagem };
  } catch (erro) {
    registrarErroDeRota({ rota: `acao/${acao}` }, erro);
    resultadoAuditoria = `erro: ${erro instanceof Error ? erro.message : String(erro)}`;
    // Não dá pra garantir que o id existe em alunas: audita sem o vínculo.
    alunaAuditoria = null;
    desfecho = { status: "erro" };
  }

  try {
    await registrarAuditoria(ator, acao, alunaAuditoria, resultadoAuditoria);
  } catch (erroAuditoria) {
    registrarErroDeRota({ rota: `acao/${acao}`, resumo: "auditoria" }, erroAuditoria);
    return { status: "sem_auditoria" };
  }

  return desfecho;
}
