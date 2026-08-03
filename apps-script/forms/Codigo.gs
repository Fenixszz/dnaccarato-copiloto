/**
 * Copiloto Dnaccarato — Google Apps Script do Google Forms.
 *
 * Dispara um POST para /api/webhooks/forms a cada resposta nova do formulário,
 * autenticando com um segredo compartilhado no header X-Forms-Secret.
 *
 * Configure as duas constantes abaixo e instale o gatilho onFormSubmit
 * (veja INSTALACAO.md). NÃO deixe o segredo em repositório público.
 */

// URL pública do endpoint (produção). Ex.: https://app.dnaccarato.com/api/webhooks/forms
var ENDPOINT = 'https://SUBSTITUA-PELO-SEU-DOMINIO/api/webhooks/forms';

// Mesmo valor de FORMS_WEBHOOK_SECRET do .env do servidor.
var FORMS_WEBHOOK_SECRET = 'COLE_AQUI_O_MESMO_SEGREDO_DO_ENV';

/**
 * Gatilho: chamado pelo Forms a cada envio de resposta.
 * @param {GoogleAppsScript.Events.FormsOnFormSubmit} e
 */
function onFormSubmit(e) {
  var form = FormApp.getActiveForm();
  var resposta = e.response;

  var respostas = {};
  var nome = '';
  var emailDasRespostas = '';

  resposta.getItemResponses().forEach(function (itemResposta) {
    var titulo = itemResposta.getItem().getTitle();
    var valor = itemResposta.getResponse();
    respostas[titulo] = valor;

    if (!nome && /nome/i.test(titulo)) {
      nome = String(valor);
    }
    if (!emailDasRespostas && /e-?mail/i.test(titulo)) {
      emailDasRespostas = String(valor);
    }
  });

  // Preferimos o e-mail coletado pelo Forms (se "Coletar e-mails" estiver ligado);
  // senão, caímos para o que veio numa pergunta de e-mail.
  var email = '';
  try {
    email = resposta.getRespondentEmail() || '';
  } catch (err) {
    email = '';
  }
  if (!email) {
    email = emailDasRespostas;
  }

  var payload = {
    formId: form.getId(),
    formTitle: form.getTitle(),
    responseId: resposta.getId(),
    email: email || null,
    nome: nome || null,
    respostas: respostas,
    respondidoEm: resposta.getTimestamp().toISOString(),
  };

  UrlFetchApp.fetch(ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Forms-Secret': FORMS_WEBHOOK_SECRET },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
}
