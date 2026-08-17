# Segurança — Copiloto Dnaccarato

Auditoria do checklist de segurança contra o código atual. Última revisão:
**2026-08-17**.

Legenda: ✅ atendido · ⚠️ parcial (tem gap) · ❌ não atendido.

## Resumo

| #   | Item                                                                      | Status     |
| --- | ------------------------------------------------------------------------- | ---------- |
| 1   | Todos os webhooks validam origem/assinatura                               | ⚠️ Parcial |
| 2   | Nenhuma rota de escrita do MCP é chamável sem token válido e escopo certo | ✅         |
| 3   | Dado sensível (CPF, pagamento) não aparece em log nenhum                  | ✅         |
| 4   | Nenhum segredo hardcoded                                                  | ✅         |
| 5   | RLS habilitado em todas as tabelas sensíveis                              | ✅         |
| 6   | Rate limiting nas rotas de webhook e no MCP                               | ❌         |
| 7   | Nenhum dado de cartão armazenado                                          | ✅         |

**Dois gaps abertos** (itens 1 e 6) — detalhados abaixo com recomendação.

---

## 1. Validação de origem/assinatura dos webhooks — ⚠️ Parcial

Cada webhook rejeita com **401** antes de processar. Todas as validações
criptográficas usam `timingSafeEqual` (nunca `==`) sobre o corpo **cru**.

| Webhook             | Rota                                   | Mecanismo                                                                                              | Evidência |
| ------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------- |
| Asaas               | `app/api/webhooks/asaas/route.ts`      | Token estático `asaas-access-token` == `ASAAS_WEBHOOK_TOKEN`                                           | ✅        |
| Autentique          | `app/api/webhooks/autentique/route.ts` | HMAC-SHA256 `X-Autentique-Signature` (`validarAssinaturaAutentique`, timing-safe)                      | ✅        |
| Calendly            | `app/api/webhooks/calendly/route.ts`   | HMAC `Calendly-Webhook-Signature` (`validarAssinaturaCalendly`, timing-safe)                           | ✅        |
| Asana               | `app/api/webhooks/asana/route.ts`      | Handshake `X-Hook-Secret` + HMAC `X-Hook-Signature` (`validarAssinaturaAsana`, timing-safe)            | ✅        |
| Drive               | `app/api/webhooks/drive/route.ts`      | Channel token `X-Goog-Channel-Token` == `DRIVE_CHANNEL_TOKEN` (o push do Drive não tem corpo assinado) | ✅        |
| Forms (Apps Script) | `app/api/webhooks/forms/route.ts`      | Segredo compartilhado `X-Forms-Secret` == `FORMS_WEBHOOK_SECRET` (Apps Script não assina)              | ✅        |
| **WhatsApp**        | `app/api/webhooks/whatsapp/route.ts`   | **Nenhuma** — só valida o payload com Zod                                                              | ❌        |

### Gap 1a — WhatsApp sem validação de origem

A rota do WhatsApp (Evolution API) **não confere segredo nem assinatura**. Ela
grava o payload em `eventos_brutos` e, quando o remetente casa com
`BRIEFING_WHATSAPP` (número da Adriana) e o evento é `messages.upsert` não
enviado por nós, chama a **Anthropic** (custo) e responde no WhatsApp.

Mitigações que já existem, mas **não substituem** a validação de origem:

- Idempotência pelo id da mensagem (evita reprocessar o mesmo evento);
- Só o caminho caro (Anthropic + resposta) roda se o payload alegar o número da
  Adriana.

Risco: um atacante que forje o payload com o número da Adriana consegue disparar
respostas da IA (gasto de crédito) e inflar `eventos_brutos`.

**Recomendação:** exigir um segredo compartilhado no webhook (ex.: header
`X-Webhook-Secret` == `WHATSAPP_WEBHOOK_SECRET`, ou conferir o `apikey` da
instância Evolution), rejeitando com 401 igual aos demais.

### Gap 1b — Rota genérica `[servico]` sem validação

`app/api/webhooks/[servico]/route.ts` valida só Zod + idempotência (o
processamento é um placeholder). Hoje ela está **sombreada** pelas rotas
específicas (todas as origens do enum `servicosWebhook` têm rota própria com
validação), então é código morto/inalcançável — mas é um risco latente se um
serviço novo entrar no enum sem rota própria.

**Recomendação:** remover a rota genérica ou colocá-la atrás da mesma validação
de assinatura por serviço.

---

## 2. MCP: escrita exige token válido + escopo — ✅

`app/api/mcp/route.ts` autentica **antes de tudo** e barra por escopo:

- `autenticarBearer` (`lib/mcp/auth.ts`): compara o **hash SHA-256** do token
  contra `api_tokens.token_hash` (o token cru nunca é guardado), e exige
  `status = 'ativo'` e `expira_em` no futuro. Falha → **401**, sem revelar o
  motivo.
- `tools/call` recusa qualquer tool fora do escopo do token:
  `if (!ferramenta || !escopo.includes(nome)) → CODIGO_NAO_AUTORIZADO`. Isso vale
  para **toda** tool, inclusive as de escrita (`enviar_lembrete_pagamento`,
  `criar_task_asana`, `remarcar_reuniao`).
- `tools/list` só expõe as tools dentro do escopo do token.

Observação: as mesmas tools de escrita também podem ser disparadas pelo
**dashboard autenticado** (ações rápidas → `executarFerramentaAuditada`, origem
`dashboard`) — caminho protegido pelo gate de auth do dashboard (Supabase), não
pelo endpoint MCP público. Toda execução é auditada em `log_auditoria`.

---

## 3. Dado sensível (CPF, pagamento) não aparece em logs — ✅

Todos os `console.*` são estruturados e registram **apenas metadados**:

- `logarErro` (`lib/webhooks/validation.ts`): `{ rota, resumo, erro }`. O
  `resumo` é sempre metadado — `{ etapa }`, `{ tool }`, `{ acao }`,
  `{ servico, chaves: Object.keys(payload) }` (só as **chaves**, nunca os
  valores).
- `registrarFalhaSistema` / `registrarAuditoria` (`lib/db/queries.ts`): em erro,
  logam `{ tipo|acao, erro }` — sem payload.
- Error boundaries do dashboard/global: logam só `error.message` (strings
  nossas).

CPF e payloads de pagamento **não** vão para log. Eles são **persistidos** (não
logados): CPF entra em `alunas.metadata` (webhook Autentique) e o corpo cru dos
webhooks vai para `eventos_brutos` — ambas tabelas com **RLS** (ver item 5).
Isso é dado em repouso protegido, não log.

Ponto de atenção (baixo): `logarErro` registra `erro.message`; mensagens de erro
do Postgres/PostgREST podem, em casos raros, citar um valor de constraint.
Mantido sob observação; nenhum caso concreto identificado.

---

## 4. Nenhum segredo hardcoded — ✅

`grep` por padrões de segredo (`sk-ant`, `sk_live/test`, `AKIA`, `BEGIN`, JWT,
atribuições literais de `password/secret/token/api_key`) em `lib/`, `app/` e
`scripts/` não encontrou segredos — a única ocorrência é um **comentário de
documentação** em `lib/integrations/anthropic-admin.ts` ("chave sk-ant-admin…").

Todo segredo é lido via `requireEnv`/`optionalEnv` (`lib/env.ts`), documentado
em `.env.example`. `.env` está no `.gitignore`.

---

## 5. RLS habilitado em todas as tabelas sensíveis — ✅

As **18** tabelas do schema têm `enable row level security` na migration que as
cria (ou na migration de hardening `..._rls_policies_indices_fks.sql`):

`alunas`, `api_tokens`, `briefings_enviados`, `chat_mensagens`,
`creditos_recargas`, `creditos_saldo`, `creditos_uso`, `documentos`,
`estado_integracoes`, `eventos_brutos`, `eventos_processados`, `falhas_sistema`,
`formularios`, `log_auditoria`, `materiais`, `pagamentos`, `reunioes`,
`tasks_asana`.

Política geral: **default-deny**. `service_role` (usada só no servidor) escreve;
`authenticated` (dashboard) tem SELECT nas tabelas liberadas; `anon` (widget) não
recebe policy → acesso negado. `chat_mensagens` restringe o SELECT do
`authenticated` às próprias mensagens (`usuario_id = auth.uid()`).

Observação: o acesso do app é 100% via `service_role` no servidor (que ignora
RLS por design). A RLS é a segunda linha de defesa caso as chaves anon/authenticated
sejam usadas diretamente.

---

## 6. Rate limiting nas rotas de webhook e no MCP — ❌ Não atendido

O único rate limiter do projeto (`lib/whatsapp/rateLimiter.ts`) é **de saída** —
espaça os envios de WhatsApp (`lib/whatsapp/client.ts`) para não disparar em
rajada. **Nenhuma rota de entrada** (webhooks ou MCP) tem rate limiting.

Impacto:

- Webhooks e o endpoint MCP podem ser martelados (custo, ruído em
  `eventos_brutos`, tentativa de brute force de token no MCP — mitigada pelo
  espaço de tokens + hash, mas sem trava de taxa).

**Recomendação:** adicionar rate limiting **por IP/rota** (e por token, no MCP).
Em serverless, um contador em memória não serve (é por instância) — usar um
limitador distribuído (ex.: Upstash Ratelimit/Redis) ou o rate limiting de borda
da Vercel/WAF. Aplicar nas rotas `app/api/webhooks/*` e `app/api/mcp`.

---

## 7. Nenhum dado de cartão armazenado — ✅

`grep` por `cartao/card/cvv/card_number/pan/credit_card` em `lib/`, `app/`,
`supabase/` e `scripts/` não encontrou **nenhuma** referência. O processamento de
cartão é 100% da **Asaas** (externo). O sistema guarda em `pagamentos` apenas
`valor`, `status`, `vencimento`, `pago_em` e `referencia_externa` — nada de PAN,
validade ou CVV.

---

## Ações recomendadas (abertas)

1. **[Gap 1a]** Validar origem do webhook do WhatsApp (segredo compartilhado ou
   `apikey` da Evolution) → 401 se não bater.
2. **[Gap 1b]** Remover a rota genérica `app/api/webhooks/[servico]/route.ts` ou
   colocá-la atrás de validação de assinatura.
3. **[Item 6]** Adicionar rate limiting distribuído nas rotas de webhook e no
   MCP.

Itens 2, 3, 4, 5 e 7: sem ação — atendidos.
