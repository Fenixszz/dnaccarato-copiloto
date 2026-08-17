# Ambiente de staging — Copiloto Dnaccarato

Runbook para um staging **isolado** de produção: projeto Supabase próprio,
variáveis de ambiente de staging na Vercel (escopo **Preview**) e Evolution API
apontando para um **número de WhatsApp de teste**. Última revisão: **2026-08-17**.

> **Regra de ouro:** staging **nunca** toca dados/contas de produção. Banco
> separado, segredos separados, Asaas em **sandbox**, WhatsApp em **número de
> teste**. Se uma variável puder vazar para produção, ela está errada.

O que dá para automatizar já está no repo (scripts `*:staging`, `.env.staging.example`).
O resto são passos nos painéis de Supabase / Vercel / Evolution — feitos **uma
vez** por quem tem acesso a essas contas (o João).

---

## Visão geral

| Camada   | Produção                            | Staging                                                         |
| -------- | ----------------------------------- | --------------------------------------------------------------- |
| Banco    | Projeto Supabase de produção        | **Projeto Supabase separado**                                   |
| Deploy   | Vercel — Production (branch `main`) | Vercel — **Preview** (branch `staging`)                         |
| URL      | domínio de produção                 | **alias de preview estável** (ex.: `staging.<proj>.vercel.app`) |
| Asaas    | conta real da Adriana               | **sandbox**                                                     |
| WhatsApp | número real da Adriana              | **número/instância de teste**                                   |
| Crons    | rodam automaticamente               | **não rodam** (disparo manual)                                  |

---

## 1. Projeto Supabase de staging

1. **Criar o projeto.** Supabase → New project (mesma org). Nome sugerido
   `dnaccarato-staging`. Guarde a senha do banco.
2. **Coletar as chaves** (Project Settings):
   - `NEXT_PUBLIC_SUPABASE_URL` — Data API → Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — API Keys → `anon` `public`
   - `SUPABASE_SERVICE_ROLE_KEY` — API Keys → `service_role` (**secreta**)
   - `SUPABASE_DB_URL` — Database → Connection string → **URI**
   - `SUPABASE_PROJECT_ID` — o ref do projeto (subdomínio da URL)
3. **Preparar o `.env.staging` local** (só na sua máquina, não commitado):
   ```bash
   cp .env.staging.example .env.staging
   # preencha os valores de staging (veja as anotações "⚠ STAGING" no arquivo)
   ```
4. **Aplicar as migrations no banco de staging:**
   ```bash
   npm run db:migrate:staging
   ```
   Usa `SUPABASE_DB_URL` do `.env.staging`; é idempotente (tabela de controle
   `_migracoes_aplicadas`). Aplica **todas** as migrations de `supabase/migrations/`,
   inclusive `20260817120000` (coluna `alunas.anonimizada_em`).
5. **Provisionar os usuários do dashboard e (opcional) semear dados fictícios:**
   ```bash
   npm run seed:usuarios:staging   # cria Adriana/João no Auth de staging
   npm run seed:staging            # 6 alunas fictícias + relacionados
   ```
6. **RLS** já vem habilitado pelas migrations — o mesmo schema de produção.

> Os tipos (`lib/db/types.ts`) são derivados do **schema**, que é idêntico nos
> dois ambientes — não há `db:types` separado para staging.

---

## 2. Variáveis de ambiente na Vercel (Preview)

A Vercel escopa cada variável por ambiente: **Production**, **Preview** e
**Development**. Staging = **Preview**. Configure em
Project → Settings → Environment Variables, marcando **apenas Preview** para os
valores de staging (mantenha os de Production intactos).

Fonte dos valores: seu `.env.staging` (o `.env.staging.example` explica cada um).

### URL estável para os webhooks

Preview deployments recebem uma URL nova a cada commit — as integrações
(Asaas, Autentique, Calendly, Asana, Drive, Forms) precisam de uma URL **fixa**.
Solução: uma branch dedicada `staging` ganha um **alias de branch** estável na
Vercel (ex.: `staging-<projeto>.vercel.app` ou um domínio `staging.<seu-domínio>`).
Aponte `NEXT_PUBLIC_APP_URL`, `MCP_SERVER_URL` e todos os webhooks das
integrações para essa URL.

- Fluxo de deploy: PRs/commits na branch `staging` → deploy Preview no alias fixo.
- `main` continua indo para Production, sem mudança.

### Quais variáveis mudam em staging

| Variável                                                                                                   | Em staging                                     |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`, `MCP_SERVER_URL`                                                                    | URL do alias de preview estável                |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`                                     | projeto de **staging**                         |
| `ASAAS_API_URL`                                                                                            | `https://sandbox.asaas.com/api/v3`             |
| `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`                                                                     | credenciais do **sandbox**                     |
| `EVOLUTION_INSTANCE`                                                                                       | instância de **teste** (ver §3)                |
| `BRIEFING_WHATSAPP`, `WHATSAPP_JOAO`                                                                       | **número de teste** (nunca o da Adriana)       |
| `DRIVE_ROOT_FOLDER_ID`                                                                                     | pasta de **teste** no Drive                    |
| `MCP_ANTHROPIC_TOKEN`                                                                                      | api_token distinto, gerado no banco de staging |
| Todos os segredos de webhook (`*_WEBHOOK_*`, `DRIVE_CHANNEL_TOKEN`, `FORMS_WEBHOOK_SECRET`, `CRON_SECRET`) | valores **distintos** dos de produção          |
| Tokens de integração (Autentique/Calendly/Asana)                                                           | contas/tokens de **teste**                     |

Podem ser **iguais** aos de produção (sem risco de escrita cruzada):
`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `GOOGLE_SERVICE_ACCOUNT_JSON`,
`EMAIL_ADRIANA`, `EMAIL_JOAO`, as tarifas de crédito. (Ainda assim, `EMAIL_*`
só liberam login — os usuários precisam existir no Auth de staging: passo §1.5.)

> `SUPABASE_DB_URL` e `SUPABASE_PROJECT_ID` são usados **só por scripts locais**
> (migrate/types). Não precisam ir para a Vercel.

### Crons em Preview

Os `crons` do [vercel.json](vercel.json) rodam **apenas em Production**. Em
staging o briefing diário **não** dispara sozinho. Para testar, bata na rota
manualmente com o `CRON_SECRET` de staging:

```bash
curl -X GET https://staging.exemplo.vercel.app/api/cron/briefing \
  -H "Authorization: Bearer $CRON_SECRET_STAGING"
```

---

## 3. Evolution API → número de WhatsApp de teste

O objetivo é que o staging **jamais** mande mensagem para o número real da
Adriana. Duas coisas garantem isso: uma **instância separada** conectada a um
**chip/número de teste**, e os números destinatários (`BRIEFING_WHATSAPP`,
`WHATSAPP_JOAO`) apontando para teste.

1. **Criar a instância de teste** na Evolution API do João (pode ser a mesma
   Evolution, instância diferente):
   ```bash
   # com o .env.staging preenchido (EVOLUTION_API_URL/KEY/INSTANCE de teste):
   npm run whatsapp:setup:staging
   ```
   Nome sugerido de instância: `dnaccarato-staging`.
2. **Conectar o número de teste**: escaneie o QR com o WhatsApp do **chip de
   teste** (nunca o da Adriana). O script salva o QR em `whatsapp-qr.png`
   (ignorado no git).
3. **Configurar os destinatários** no `.env.staging` (e no Preview da Vercel):
   - `EVOLUTION_INSTANCE` = `dnaccarato-staging`
   - `BRIEFING_WHATSAPP` = número de teste (recebe o briefing)
   - `WHATSAPP_JOAO` = número de teste (recebe alertas de infra)
4. **Webhook de entrada** (se usar o fluxo de resposta do WhatsApp): configure o
   webhook da instância de teste para `NEXT_PUBLIC_APP_URL/api/webhooks/whatsapp`
   do alias de staging.

> O rate limiter de saída (`lib/whatsapp/rateLimiter.ts`) e o débito de crédito
> por mensagem seguem valendo em staging — o comportamento é o mesmo de produção,
> só o destino é de teste.

---

## 4. Checklist de "staging isolado"

Antes de considerar o staging pronto, confirme:

- [ ] `NEXT_PUBLIC_SUPABASE_URL` (Preview) ≠ o de Production.
- [ ] `SUPABASE_DB_URL` no `.env.staging` aponta para o banco de staging (rode
      `npm run db:migrate:staging` e confira que criou as tabelas no projeto novo).
- [ ] `ASAAS_API_URL` = sandbox.
- [ ] `BRIEFING_WHATSAPP` e `WHATSAPP_JOAO` (Preview) são números de **teste**.
- [ ] `EVOLUTION_INSTANCE` (Preview) = instância de teste conectada ao chip de teste.
- [ ] Segredos de webhook e `CRON_SECRET` (Preview) são **distintos** dos de produção.
- [ ] Webhooks das integrações de teste apontam para a URL de staging (não a de prod).
- [ ] Login no staging funciona (usuários provisionados por `seed:usuarios:staging`).

---

## Referência rápida — scripts

| Comando                          | O que faz                                              |
| -------------------------------- | ------------------------------------------------------ |
| `npm run db:migrate:staging`     | aplica migrations no banco de staging (`.env.staging`) |
| `npm run seed:staging`           | popula dados fictícios no staging                      |
| `npm run seed:usuarios:staging`  | provisiona Adriana/João no Auth de staging             |
| `npm run whatsapp:setup:staging` | cria a instância de teste + webhook (número de teste)  |

Todos carregam `.env.staging` via `DOTENV_CONFIG_PATH`. Sem esse arquivo, falham
com erro claro de variável ausente (`lib/env.ts`).
