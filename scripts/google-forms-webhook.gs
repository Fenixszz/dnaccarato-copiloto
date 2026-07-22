/**
 * Webhook do Google Forms → Copiloto Dnaccarato
 * ============================================================================
 *
 * Este script fica ATRELADO ao Google Form da Adriana e dispara um POST
 * autenticado pro endpoint /api/webhooks/forms toda vez que uma resposta
 * nova chega. O formato do payload casa com lib/validation/forms.ts.
 *
 * PASSO A PASSO DE INSTALAÇÃO
 * ----------------------------------------------------------------------------
 * 1. Abra o Google Form da Adriana (na conta que é DONA do formulário).
 *
 * 2. Menu ⋮ (canto superior direito) → "Apps Script". Abre o editor de
 *    script já vinculado ao formulário.
 *
 * 3. Apague o conteúdo do arquivo Código.gs e cole ESTE arquivo inteiro.
 *    Salve (Ctrl/Cmd+S).
 *
 * 4. Configure as propriedades do script (é onde ficam URL e token, fora do
 *    código): ícone de engrenagem "Configurações do projeto" (menu lateral)
 *    → seção "Propriedades do script" → "Adicionar propriedade do script":
 *
 *      WEBHOOK_URL   = https://SEU-DOMINIO/api/webhooks/forms
 *      WEBHOOK_TOKEN = (o MESMO valor de FORMS_WEBHOOK_TOKEN no .env.local
 *                       do projeto; gere um valor aleatório longo)
 *
 * 5. Volte ao editor, selecione a função "instalarGatilho" no menu suspenso
 *    da barra superior e clique em "Executar". O Google vai pedir
 *    autorização — revise e aceite (permissões: ler o formulário e chamar
 *    serviço externo).
 *
 * 6. Teste: envie uma resposta de verdade no formulário. Depois confira no
 *    menu lateral "Execuções": deve aparecer "aoReceberResposta" com status
 *    "Concluída". Se aparecer "Com falha", o erro registrado diz o motivo
 *    (token errado, URL errada, servidor fora do ar...).
 *
 * MANUTENÇÃO
 * ----------------------------------------------------------------------------
 * - Trocou o domínio ou o token? Só atualize as propriedades do script
 *   (passo 4) — não precisa mexer no código.
 * - Rodar "instalarGatilho" de novo é seguro: ele remove o gatilho antigo
 *   antes de criar o novo (nunca duplica).
 * - O endpoint é idempotente pelo id da resposta: se o script rodar duas
 *   vezes pra mesma resposta, o servidor ignora a segunda sem duplicar nada.
 */

/**
 * Cria (ou recria) o gatilho "ao enviar formulário". Execute UMA VEZ, pelo
 * editor, depois de configurar as propriedades do script.
 */
function instalarGatilho() {
  var propriedades = PropertiesService.getScriptProperties();
  if (!propriedades.getProperty("WEBHOOK_URL") || !propriedades.getProperty("WEBHOOK_TOKEN")) {
    throw new Error(
      "Configure WEBHOOK_URL e WEBHOOK_TOKEN em Configurações do projeto → Propriedades do script (passo 4 das instruções)."
    );
  }

  // Remove gatilhos antigos deste projeto pra nunca duplicar o envio.
  ScriptApp.getProjectTriggers().forEach(function (gatilho) {
    ScriptApp.deleteTrigger(gatilho);
  });

  ScriptApp.newTrigger("aoReceberResposta").forForm(FormApp.getActiveForm()).onFormSubmit().create();

  Logger.log("Gatilho instalado. Envie uma resposta de teste no formulário.");
}

/**
 * Disparada automaticamente a cada resposta enviada. Monta o payload no
 * contrato do copiloto e faz o POST autenticado.
 */
function aoReceberResposta(evento) {
  var propriedades = PropertiesService.getScriptProperties();
  var url = propriedades.getProperty("WEBHOOK_URL");
  var token = propriedades.getProperty("WEBHOOK_TOKEN");
  if (!url || !token) {
    throw new Error("WEBHOOK_URL e WEBHOOK_TOKEN não configurados nas propriedades do script.");
  }

  var resposta = evento.response;
  var payload = {
    resposta_id: resposta.getId(),
    formulario_nome: FormApp.getActiveForm().getTitle(),
    respondido_em: resposta.getTimestamp().toISOString(),
    // Preenchido só se o Form estiver configurado pra coletar email.
    email: resposta.getRespondentEmail() || null,
    respostas: resposta.getItemResponses().map(function (item) {
      var valor = item.getResponse();
      return {
        pergunta: item.getItem().getTitle(),
        // Perguntas de múltipla escolha com várias marcações viram uma
        // string separada por vírgula.
        resposta: Array.isArray(valor) ? valor.join(", ") : String(valor),
      };
    }),
  };

  var respostaHttp = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: { "x-forms-token": token },
    payload: JSON.stringify(payload),
    // Sem exceção automática: tratamos o status abaixo pra registrar um erro
    // legível em Execuções.
    muteHttpExceptions: true,
  });

  var status = respostaHttp.getResponseCode();
  if (status >= 300) {
    throw new Error(
      "Webhook do copiloto respondeu HTTP " + status + ": " + respostaHttp.getContentText()
    );
  }
}
