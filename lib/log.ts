type ContextoDeErro = {
  rota: string;
  // Resumo do payload SEM dado sensível (nada de CPF, token, valor de
  // pagamento etc.) — só o suficiente pra rastrear o evento.
  resumo?: string;
};

export function registrarErroDeRota(contexto: ContextoDeErro, erro: unknown): void {
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  console.error(
    JSON.stringify({
      nivel: "erro",
      rota: contexto.rota,
      resumo: contexto.resumo,
      mensagem,
      timestamp: new Date().toISOString(),
    })
  );
}

// Falha grave que já esgotou as tentativas de recuperação (ex.: envio pela
// Evolution que falhou 3 vezes). Severidade alta pra o log ser filtrável.
export function registrarFalhaCritica(area: string, contexto: string, mensagem: string): void {
  console.error(
    JSON.stringify({
      nivel: "critico",
      severidade: "alta",
      area,
      contexto,
      mensagem,
      timestamp: new Date().toISOString(),
    })
  );
}
