# Integração Google Forms → /api/webhooks/forms (Apps Script)

O Google Forms não assina requisições nativamente. Então usamos um **Apps Script
atrelado ao formulário** que, a cada resposta nova, faz um `POST` para o endpoint
`/api/webhooks/forms` com um **segredo compartilhado** no header `X-Forms-Secret`.
O servidor compara esse header com a variável `FORMS_WEBHOOK_SECRET`.

## Pré-requisitos

- O valor de `FORMS_WEBHOOK_SECRET` (está no `.env` do servidor — já gerado).
- A URL **pública** do endpoint (após deploy), ex.:
  `https://SEU-DOMINIO/api/webhooks/forms`. Enquanto estiver só em `localhost`,
  o Apps Script do Google não consegue alcançar o endpoint.

## Passo a passo

1. **Abra o formulário** da Adriana no Google Forms (modo edição).
2. No menu de três pontinhos (⋮, canto superior direito) → **Editor de scripts**
   (Apps Script). Isso cria um projeto de script **atrelado ao formulário**.
3. Apague o conteúdo padrão e **cole o conteúdo de [`Codigo.gs`](./Codigo.gs)**.
4. No topo do arquivo, edite as duas constantes:
   - `ENDPOINT` → a URL pública do webhook (`https://SEU-DOMINIO/api/webhooks/forms`).
   - `FORMS_WEBHOOK_SECRET` → **exatamente** o mesmo valor de `FORMS_WEBHOOK_SECRET`
     do `.env` do servidor.
5. **Salve** o projeto (ícone de disquete) e dê um nome (ex.: "Copiloto — Forms").
6. **Instale o gatilho** (trigger) de envio de resposta:
   - No menu lateral do editor, clique no ícone de **relógio** (Acionadores/Triggers).
   - **+ Adicionar acionador** e configure:
     - Função a ser executada: **`onFormSubmit`**
     - Implantação: **Head**
     - Origem do evento: **No formulário** (From form)
     - Tipo de evento: **Ao enviar formulário** (On form submit)
   - **Salvar**.
7. **Autorize** o script quando o Google pedir (é a conta da Adriana que autoriza;
   permissões: acessar o formulário e fazer chamadas externas via `UrlFetchApp`).
   - Se aparecer "app não verificado": **Avançado → Acessar (projeto) (não seguro)**
     — é o próprio script dela, pode prosseguir.

## Teste

- **Responda** ao formulário uma vez.
- No servidor, verifique que chegou: um registro em `eventos_brutos` (origem
  `forms`) e um em `formularios`, além da aluna casada/criada.
- Reenviar/reprocessar a **mesma resposta** não duplica (idempotência por
  `responseId`).
- No editor do Apps Script, **Execuções** (Executions) mostra cada disparo e
  eventuais erros de `UrlFetchApp` (ex.: 401 = segredo divergente).

## Segurança

- O segredo trafega em texto no header, então **use HTTPS** no endpoint.
- Se o segredo vazar, **gere um novo** `FORMS_WEBHOOK_SECRET` no `.env` e atualize
  a constante no Apps Script (os dois têm que ser iguais).
- O header é conferido **antes** de qualquer processamento; requisição sem o
  segredo correto recebe `401` e nada é gravado.
