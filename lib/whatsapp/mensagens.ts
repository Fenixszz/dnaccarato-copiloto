// Templates das mensagens enviadas pelo copiloto via WhatsApp.

export type PagamentoParaLembrete = {
  valor: number;
  vencimento: string | null;
};

function formatarValor(valor: number): string {
  return `R$ ${valor.toFixed(2).replace(".", ",")}`;
}

function formatarData(dataIso: string): string {
  const [ano, mes, dia] = dataIso.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

export function montarLembreteDePagamento(
  nomeDaAluna: string,
  pagamentosAtrasados: PagamentoParaLembrete[]
): string {
  const primeiroNome = nomeDaAluna.trim().split(/\s+/)[0];
  const descricoes = pagamentosAtrasados.map((pagamento) => {
    const valor = formatarValor(pagamento.valor);
    return pagamento.vencimento
      ? `${valor} (venceu em ${formatarData(pagamento.vencimento)})`
      : valor;
  });
  const lista =
    descricoes.length === 1
      ? descricoes[0]
      : `${descricoes.slice(0, -1).join(", ")} e ${descricoes.at(-1)}`;
  return (
    `Oi, ${primeiroNome}! Tudo bem? 💚\n\n` +
    `Passando só pra lembrar do pagamento em aberto: ${lista}.\n\n` +
    `Se já tiver pago, pode ignorar esta mensagem. Qualquer dúvida, é só responder por aqui!`
  );
}
