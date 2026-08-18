# Deploy de produção — Copiloto Dnaccarato

Passo a passo do deploy em produção (Vercel), variáveis necessárias, confirmação
do domínio `copiloto.drinaccarato.com.br` e smoke test pós-deploy. Última
revisão: **2026-08-18**.

- **Produção** = branch `main` → deploy **Production** na Vercel.
- **Staging** = branch `staging` → deploy **Preview** (ver [STAGING.md](STAGING.md)).
- Domínio de produção: **https://copiloto.drinaccarato.com.br**

---

## 1. Passo a passo do deploy

1. **Código no `main`.** Garanta que o `main` local está no GitHub:

   ```bash
   git checkout main && git push origin main
   ```

   A Vercel faz deploy Production automático a cada push no `main`.

2. **Projeto conectado na Vercel.** Project → Settings → Git: repositório
   `Fenixszz/dnaccarato-copiloto`, **Production Branch = `main`**.

3. **Variáveis de ambiente (escopo Production).** Ver seção 2. Use o
   **Import .env** colando o `.env` de produção, marcando **Production**.

4. **Migrations no banco de PRODUÇÃO.** As migrations não rodam sozinhas no
   deploy — aplique com o `.env` de produção apontando pro banco de produção:

   ```bash
   npm run db:migrate
   ```

   Idempotente (só aplica o que falta). Confirma que as tabelas mais recentes
   existem (ex.: `creditos_*`, `chat_mensagens`, `alunas.anonimizada_em`).

5. **Deploy.** Push no `main` (passo 1) ou Vercel → Deployments → **Redeploy**.
   Depois de setar variáveis novas, **redeploy é obrigatório** — as
   `NEXT_PUBLIC_*` entram no build.

6. **Domínio.** Confirme o apontamento (seção 3).

7. **Smoke test.** Rode o checklist da seção 4.

---

## 2. Variáveis de ambiente em produção (Vercel → escopo Production)

> `NODE_ENV` a Vercel define sozinha como `production` — **não** configure manual.

### Obrigatórias

| Variável                                                                  | Observação                                              |
| ------------------------------------------------------------------------- | ------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                                                     | **`https://copiloto.drinaccarato.com.br`**              |
| `NEXT_PUBLIC_SUPABASE_URL`                                                | projeto Supabase de produção                            |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`                                           | idem                                                    |
| `SUPABASE_SERVICE_ROLE_KEY`                                               | idem (secreta)                                          |
| `EMAIL_ADRIANA`                                                           | allowlist do dashboard                                  |
| `EMAIL_JOAO`                                                              | allowlist do dashboard                                  |
| `ANTHROPIC_API_KEY`                                                       | conta Anthropic FOVA                                    |
| `ANTHROPIC_MODEL`                                                         | ex.: `claude-opus-4-8`                                  |
| `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` / `EVOLUTION_INSTANCE`          | WhatsApp (Evolution)                                    |
| `WHATSAPP_JOAO`                                                           | número do João (alertas de infra)                       |
| `BRIEFING_WHATSAPP`                                                       | número da Adriana (briefing diário)                     |
| `BRIEFING_HORA` / `BRIEFING_LIMITE_HORA`                                  | horários do briefing (fuso SP)                          |
| `CRON_SECRET`                                                             | protege `/api/cron/*` (a Vercel injeta no cron)         |
| `GOOGLE_SERVICE_ACCOUNT_JSON`                                             | conta de serviço (Drive/Gmail/Agenda/Forms)             |
| `DRIVE_ROOT_FOLDER_ID`                                                    | pasta raiz real das alunas                              |
| `DRIVE_CHANNEL_TOKEN`                                                     | valida push do Drive                                    |
| `ASAAS_API_KEY` / `ASAAS_API_URL`                                         | pagamentos (produção)                                   |
| `ASAAS_WEBHOOK_TOKEN`                                                     | valida webhook Asaas                                    |
| `AUTENTIQUE_API_TOKEN` / `AUTENTIQUE_WEBHOOK_SECRET`                      | assinatura de documentos                                |
| `ASANA_ACCESS_TOKEN` / `ASANA_WORKSPACE_ID` / `ASANA_WEBHOOK_RESOURCE_ID` | tarefas                                                 |
| `FORMS_WEBHOOK_SECRET`                                                    | valida webhook do Apps Script (Forms)                   |
| `MCP_ANTHROPIC_TOKEN`                                                     | Bearer do conector MCP (gerado por `npm run mcp:token`) |
| `PIX_CHAVE_JOAO`                                                          | chave Pix exibida na tela de créditos                   |
| `CREDITO_ANTHROPIC_INPUT_CENTAVOS_POR_MTOK`                               | tarifa (estimativa de custo)                            |
| `CREDITO_ANTHROPIC_OUTPUT_CENTAVOS_POR_MTOK`                              | tarifa                                                  |
| `CREDITO_WHATSAPP_CENTAVOS_POR_MSG`                                       | tarifa                                                  |

### Opcionais (podem ficar vazias)

| Variável                                              | Efeito se vazia                                      |
| ----------------------------------------------------- | ---------------------------------------------------- |
| `ANTHROPIC_ADMIN_API_KEY`                             | some a seção de custo real de IA na tela de créditos |
| `MCP_SERVER_URL`                                      | usa `NEXT_PUBLIC_APP_URL/api/mcp`                    |
| `CALENDLY_API_TOKEN` / `CALENDLY_WEBHOOK_SIGNING_KEY` | integração Calendly desligada (não usada hoje)       |

### NÃO configurar na Vercel (só uso local, em scripts)

`SUPABASE_DB_URL` (migrations), `SUPABASE_PROJECT_ID` (`db:types`),
`SEED_SENHA_ADRIANA` / `SEED_SENHA_JOAO` (`seed:usuarios`). Rodam da sua máquina,
não em runtime.

### NÃO adicionar (resíduo, não usado pelo código)

`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`,
`GOOGLE_REFRESH_TOKEN` — o Google usa `GOOGLE_SERVICE_ACCOUNT_JSON`.

---

## 3. Domínio: `copiloto.drinaccarato.com.br`

O domínio é um **subdomínio** de `drinaccarato.com.br`. O apontamento é por
**CNAME** — `copiloto` → alvo da Vercel (`cname.vercel-dns.com`). Esse CNAME foi
criado na hora da ligação do domínio.

### Como confirmar que está apontando certo

1. **Na Vercel:** Project → Settings → **Domains**. `copiloto.drinaccarato.com.br`
   deve aparecer com **"Valid Configuration"**. Se ainda estiver
   **"Invalid Configuration" / pendente**, o DNS ainda não propagou — a própria
   aba mostra o status e o registro esperado. Propagação leva de minutos a ~48h.
2. **Pelo terminal:**
   ```bash
   dig copiloto.drinaccarato.com.br +short      # deve resolver p/ a Vercel (cname.vercel-dns.com / IP da Vercel)
   curl -I https://copiloto.drinaccarato.com.br/api/health   # deve responder 200 com HTTPS válido
   ```
3. **HTTPS:** a Vercel emite o certificado automaticamente assim que o CNAME
   valida. Se der erro de certificado, é sinal de que ainda está propagando.
4. Confirme que `NEXT_PUBLIC_APP_URL` = `https://copiloto.drinaccarato.com.br`
   (senão callbacks/links do widget saem com a URL errada).

---

## 4. Smoke test pós-deploy

Rode em sequência. Tudo verde = deploy saudável.

- [ ] **1) Health responde.**

  ```bash
  curl https://copiloto.drinaccarato.com.br/api/health
  ```

  Esperado: HTTP 200 e JSON `{"status":"ok",...}` (ou `"degradado"` se o briefing
  ainda não rodou hoje — isso é normal e ainda é saudável). Confirme que
  `checks.briefing.status` **não** é `"desconhecido"` — isso garante que o app
  alcançou o **banco**.

- [ ] **2) Dashboard carrega.** Abra `https://copiloto.drinaccarato.com.br` no
      navegador → deve redirecionar para `/login` (gate de auth) → faça login como
      Adriana ou João → a home deve carregar os cards com números reais.

- [ ] **3) Widget carrega.** Abra `/widget` → o chat público deve aparecer
      (casca + aviso de privacidade). Sem login, mostra o aviso de "entre para
      conversar".

- [ ] **4) Um webhook de teste chega.** Confirme que a ingestão funciona:
  - **Reachability + auth (seguro):** sem o segredo deve dar **401**.
    ```bash
    curl -s -o /dev/null -w "%{http_code}\n" \
      -X POST https://copiloto.drinaccarato.com.br/api/webhooks/asaas
    # esperado: 401
    ```
  - **Chegada de fato:** dispare um **evento de teste** pelo painel do serviço
    (ex.: Asaas → "Enviar webhook de teste") **ou** um `curl` com o header de
    segredo correto, e confirme no Supabase (Table editor → **`eventos_brutos`**)
    que apareceu uma linha nova. Use dados de **teste** para não afetar registros
    reais.

- [ ] **5) Cron do briefing (opcional).** Confirme em Vercel → Settings → Cron
      Jobs que `/api/cron/briefing` está agendado (`0 * * * *`). Para testar na hora:
  ```bash
  curl https://copiloto.drinaccarato.com.br/api/cron/briefing \
    -H "Authorization: Bearer <CRON_SECRET>"
  ```

---

## 5. Integridade do DNS — WordPress intacto

**Nenhum registro DNS existente foi alterado.** A ligação do domínio na Vercel
**adicionou apenas um registro novo**:

| Registro                       | Tipo             | Aponta para                     | Status            |
| ------------------------------ | ---------------- | ------------------------------- | ----------------- |
| `copiloto.drinaccarato.com.br` | **CNAME** (novo) | Vercel (`cname.vercel-dns.com`) | criado na ligação |

O que **permaneceu inalterado**:

- `drinaccarato.com.br` (apex) e `www.drinaccarato.com.br` continuam apontando
  para a hospedagem do **WordPress** — não foram tocados.
- Registros `MX` (e-mail), `TXT` (SPF/verificações) e demais não foram
  modificados nem removidos.

Ou seja: o site **WordPress em `drinaccarato.com.br` continua no ar e intacto**.
Só subimos um subdomínio novo (`copiloto.`) ao lado, sem mexer no que já existia.

### Como confirmar que o WordPress segue intacto

```bash
dig drinaccarato.com.br +short      # deve continuar retornando o IP/host do WordPress
curl -I https://drinaccarato.com.br # o site WP deve responder normalmente
```

E abra `https://drinaccarato.com.br` no navegador — a home do WordPress deve
carregar como sempre.

---

## 6. Rollback

Se algo quebrar em produção: Vercel → **Deployments** → escolha o último deploy
bom → **Promote to Production** (ou "Instant Rollback"). O domínio passa a servir
o deploy anterior imediatamente, sem alterar DNS.
