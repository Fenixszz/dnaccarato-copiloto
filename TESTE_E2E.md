# Teste ponta a ponta (E2E) — Copiloto Dnaccarato

Roteiro **reutilizável** para validar o fluxo completo do sistema com dados
próximos do real, a cada entrega. Última revisão: **2026-08-18**.

> **O que este teste é.** Um passeio pela cadeia inteira: um evento externo
> entra por webhook → é cruzado com a aluna certa (matching) → aparece no dossiê
> → o briefing da manhã resume tudo → uma resposta no WhatsApp aciona uma tool
> do copiloto → o crédito debita e aparece no extrato. Se todos os passos passam,
> a integração de ponta a ponta está saudável.
>
> **Onde rodar.** No ambiente de **staging** (ver [STAGING.md](STAGING.md)) — com
> contas **sandbox/teste** e **número de WhatsApp de teste**. **Nunca** rode este
> teste apontando para produção: ele cria pagamentos, documentos e mensagens.
>
> **Escopo.** Este é um teste **manual assistido** (dispara nos serviços reais de
> sandbox e verifica o efeito). Ele complementa — não substitui — a suíte
> automatizada (`npm run test`, 261 testes de componente: matching, briefing,
> tools MCP, créditos).

---

## Pré-condições (checar antes de começar)

- [ ] Staging no ar (deploy Preview da branch `staging`) com URL estável.
- [ ] `npm run db:migrate:staging` aplicado (banco de staging com todas as tabelas).
- [ ] `npm run seed:usuarios:staging` (Adriana/João conseguem logar no staging).
- [ ] `.env.staging` completo (Supabase de staging, Asaas **sandbox**, WhatsApp de teste).
- [ ] Webhooks das integrações de teste apontando para a URL de staging
      (Asaas sandbox, Autentique, Drive `drive:watch`, Forms Apps Script, Calendly).
- [ ] Acesso ao **Supabase de staging** (Table editor / SQL) para as verificações.
- [ ] Um **número de WhatsApp de teste** conectado à instância de staging.

Como verificar (webhooks): cada rota rejeita sem o segredo. Ex.:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST $URL/api/webhooks/asaas   # 401 esperado
```

---

## Persona de teste (dados fixos — reutilize sempre os mesmos)

Use SEMPRE a mesma aluna fictícia, pra o teste ser repetível e fácil de limpar:

| Campo    | Valor                                                           |
| -------- | --------------------------------------------------------------- |
| Nome     | `Mariana Teste E2E`                                             |
| E-mail   | `mariana.e2e@teste.local`                                       |
| Telefone | um número de teste que você controla (ex.: `+55 11 90000-0001`) |
| Marcador | `metadata.e2e = true` (facilita achar e limpar depois)          |

> **Dica de matching:** nos serviços externos, cadastre a mesma pessoa com uma
> pequena variação de nome (ex.: `Mariana T. E2E`) para provar que o **matching
> fuzzy** liga ao mesmo cadastro.

---

## Convenções de verificação

- **SQL:** rode no Supabase de staging (SQL editor). Os exemplos abaixo assumem a
  persona acima. Guarde o `id` da aluna:
  ```sql
  select id, nome, email from public.alunas where email = 'mariana.e2e@teste.local';
  ```
- **Dashboard:** abra a URL de staging, logue como Adriana/João, confira as telas.
- **Ingestão bruta:** todo webhook grava em `eventos_brutos` **antes** de
  processar — é o primeiro lugar pra confirmar que "o evento chegou".

---

## Passos

### Passo 0 — Preparar a aluna de teste

**Ação:** cadastre a persona (via importação ou inserção direta no staging), para
o matching ter em quem "encaixar" os eventos.

```sql
insert into public.alunas (nome, email, telefone, metadata)
values ('Mariana Teste E2E', 'mariana.e2e@teste.local', '+5511900000001',
        '{"e2e": true}'::jsonb)
on conflict do nothing;
```

**Passa se:** a aluna existe (`select` acima retorna 1 linha).

---

### Passo 1 — Pagamento no Asaas (sandbox) → matching

**Ação:** no **Asaas sandbox**, crie um cliente com o nome da persona e uma
cobrança; marque como **recebida** (o sandbox dispara o webhook
`PAYMENT_RECEIVED`). Alternativa: use "Enviar webhook de teste" do painel.

**Esperado:** o webhook chega, é gravado, e o pagamento é **vinculado à aluna**.

**Verificar:**

```sql
select origem, recebido_em from public.eventos_brutos
  where origem = 'asaas' order by recebido_em desc limit 3;

select p.status, p.valor, p.origem, p.referencia_externa
  from public.pagamentos p
  join public.alunas a on a.id = p.aluna_id
  where a.email = 'mariana.e2e@teste.local';
```

**Passa se:** aparece a linha em `eventos_brutos` **e** o `pagamentos` está ligado
à aluna certa (matching funcionou). Confirme também no dossiê da aluna no dashboard.

---

### Passo 2 — Documento assinado no Autentique (sandbox/teste)

**Ação:** no ambiente de **teste do Autentique**, crie um documento para a persona
e assine-o (dispara o webhook de assinatura).

**Verificar:**

```sql
select d.tipo, d.status, d.assinado_em, d.documento_id_externo
  from public.documentos d
  join public.alunas a on a.id = d.aluna_id
  where a.email = 'mariana.e2e@teste.local';
```

**Passa se:** o documento aparece com `status = 'assinado'` e `assinado_em`
preenchido, ligado à aluna. (No dossiê: "documentos" mostra assinado.)

---

### Passo 3 — Material novo detectado no Drive

**Ação:** adicione um arquivo novo na **pasta de teste** do Drive
(`DRIVE_ROOT_FOLDER_ID` de staging), na subpasta da persona. (Requer o canal de
push registrado: `DOTENV_CONFIG_PATH=.env.staging npm run drive:watch`.)

**Verificar:**

```sql
select m.nome_arquivo, m.tipo, m.adicionado_em
  from public.materiais m
  join public.alunas a on a.id = m.aluna_id
  where a.email = 'mariana.e2e@teste.local'
  order by m.adicionado_em desc;
```

**Passa se:** o arquivo novo aparece em `materiais` ligado à aluna.

---

### Passo 4 — Resposta de formulário

**Ação:** responda o **Google Form de teste** (o Apps Script posta em
`/api/webhooks/forms` com `X-Forms-Secret`). Use o e-mail/nome da persona.

**Verificar:**

```sql
select f.formulario_nome, f.respondido_em
  from public.formularios f
  join public.alunas a on a.id = f.aluna_id
  where a.email = 'mariana.e2e@teste.local';
```

**Passa se:** a resposta aparece em `formularios` ligada à aluna.

---

### Passo 5 — Agendamento no Calendly

**Ação:** agende um evento de teste no **Calendly de teste** para a persona
(dispara `invitee.created`). _(Se a Adriana ainda não usa Calendly, marque este
passo como N/A — ver "Passos opcionais".)_

**Verificar:**

```sql
select r.origem, r.data_hora, r.status
  from public.reunioes r
  join public.alunas a on a.id = r.aluna_id
  where a.email = 'mariana.e2e@teste.local'
  order by r.data_hora desc;
```

**Passa se:** a reunião aparece em `reunioes` com a `data_hora` correta.

---

### Passo 6 — Briefing da manhã seguinte reflete tudo

**Ação:** dispare o briefing (na prática ele roda no horário; para testar na hora,
force a rota):

```bash
curl $URL/api/cron/briefing -H "Authorization: Bearer $CRON_SECRET_STAGING"
```

**Esperado:** o copiloto detecta os furos/eventos da persona, monta o resumo,
**envia no WhatsApp de teste** e registra o envio.

**Verificar:**

```sql
select destino, status, enviado_em, left(conteudo, 400) as previa
  from public.briefings_enviados order by enviado_em desc limit 1;
```

**Passa se:** (a) chegou uma mensagem no **WhatsApp de teste**; (b)
`briefings_enviados` tem a linha de hoje; (c) o conteúdo **menciona** os itens
gerados nos passos 1–5 (pagamento, documento, material, formulário, reunião).

---

### Passo 7 — Resposta no WhatsApp aciona tool MCP

**Ação:** do WhatsApp de teste, **responda** pedindo algo que exija uma tool —
ex.: _"Como está a Mariana Teste E2E?"_ ou _"manda um lembrete de pagamento pra
Mariana Teste E2E"_.

**Esperado:** o loop conversacional chama a Anthropic, que aciona a tool MCP certa
(`status_aluna`, `enviar_lembrete_pagamento`, etc.) e responde no WhatsApp.

**Verificar:**

```sql
select acao, resultado, origem, criado_em
  from public.log_auditoria
  where origem = 'mcp' order by criado_em desc limit 5;
```

**Passa se:** a tool esperada aparece em `log_auditoria` (origem `mcp`,
`resultado = 'sucesso'`) **e** você recebeu a resposta coerente no WhatsApp.

---

### Passo 8 — Recarga manual sobe o saldo e o débito aparece no extrato

**Ação (recarga):** logado como **João** no dashboard de staging, tela
**/creditos → "Registrar recarga recebida"** — registre um valor (ex.: R$ 50).

**Verificar (saldo subiu):**

```sql
select saldo_centavos from public.creditos_saldo;                       -- subiu +5000
select valor_centavos, registrada_por, criado_em
  from public.creditos_recargas order by criado_em desc limit 1;        -- a recarga
```

**Ação (débito de uso):** os passos 6 e 7 já gastaram IA + WhatsApp. Confirme que
o **extrato** registrou:

```sql
select servico, sum(valor_estimado_centavos) as total_centavos, count(*)
  from public.creditos_uso group by servico;                            -- anthropic e whatsapp
```

**Passa se:** o `saldo_centavos` reflete a recarga **menos** os débitos, e a tela
**/creditos** mostra o extrato por categoria (IA / WhatsApp) e o histórico de
recargas.

---

## Passos opcionais / N/A

Se a Adriana ainda não usa uma integração, marque o passo como **N/A** e registre
no log — não é falha. Hoje: **Calendly** (passo 5) costuma ser N/A. Autentique e
Asana estão ativos.

---

## Critério de aprovação

✅ **Aprovado** quando os passos 0–4, 6, 7 e 8 passam (5 é N/A permitido) e:

- nenhum erro em `falhas_sistema` relacionado ao teste;
- o dossiê da persona no dashboard mostra pagamento + documento + material +
  formulário (+ reunião, se Calendly ativo);
- o briefing citou os itens e a resposta do WhatsApp acionou a tool certa.

Verificação de erros:

```sql
select tipo, severidade, mensagem, created_at
  from public.falhas_sistema order by created_at desc limit 10;
```

---

## Teardown (limpar os dados de teste)

Rode **no staging** ao final (ordem respeita as FKs `on delete restrict`):

```sql
-- guarde o id
select id from public.alunas where email = 'mariana.e2e@teste.local';

-- filhos que cascateiam já somem; os retidos (pagamentos/documentos) apague antes:
delete from public.pagamentos  where aluna_id = '<ID>';
delete from public.documentos  where aluna_id = '<ID>';
delete from public.materiais   where aluna_id = '<ID>';
delete from public.formularios where aluna_id = '<ID>';
delete from public.reunioes    where aluna_id = '<ID>';
delete from public.tasks_asana where aluna_id = '<ID>';
delete from public.alunas      where id = '<ID>';
```

> Alternativa "produto": exercitar o próprio endpoint de LGPD
> `POST /api/alunas/<ID>/anonimizar` (como Adriana) — assim você testa a
> anonimização de brinde. Mas ele **mantém** pagamentos/documentos por retenção,
> então pra zerar o staging use o SQL acima.

---

## Registro de execução (preencher a cada entrega)

Copie o bloco abaixo e preencha a cada rodada — é o histórico reutilizável.

```
Data:            AAAA-MM-DD
Commit/versão:   <git rev-parse --short HEAD>
Ambiente:        staging (URL: __________)
Executado por:   __________

Passo 0 (aluna)          [ ] passou  [ ] falhou   obs:
Passo 1 (Asaas+match)    [ ] passou  [ ] falhou   obs:
Passo 2 (Autentique)     [ ] passou  [ ] falhou   obs:
Passo 3 (Drive)          [ ] passou  [ ] falhou   obs:
Passo 4 (Formulário)     [ ] passou  [ ] falhou   obs:
Passo 5 (Calendly)       [ ] passou  [ ] falhou  [ ] N/A   obs:
Passo 6 (Briefing)       [ ] passou  [ ] falhou   obs:
Passo 7 (WhatsApp→MCP)   [ ] passou  [ ] falhou   obs:
Passo 8 (Recarga+extrato)[ ] passou  [ ] falhou   obs:

Suíte automatizada (npm run test): [ ] verde  (___/___)
Resultado final:  [ ] APROVADO   [ ] REPROVAR

Achados / follow-ups:
-
```

---

## Apêndice — mecanismo de cada webhook (referência)

| Serviço    | Rota                       | Autenticação                                         |
| ---------- | -------------------------- | ---------------------------------------------------- |
| Asaas      | `/api/webhooks/asaas`      | header `asaas-access-token` == `ASAAS_WEBHOOK_TOKEN` |
| Autentique | `/api/webhooks/autentique` | HMAC `X-Autentique-Signature`                        |
| Calendly   | `/api/webhooks/calendly`   | HMAC `Calendly-Webhook-Signature`                    |
| Asana      | `/api/webhooks/asana`      | handshake `X-Hook-Secret` + HMAC `X-Hook-Signature`  |
| Drive      | `/api/webhooks/drive`      | `X-Goog-Channel-Token` == `DRIVE_CHANNEL_TOKEN`      |
| Forms      | `/api/webhooks/forms`      | `X-Forms-Secret` == `FORMS_WEBHOOK_SECRET`           |
| WhatsApp   | `/api/webhooks/whatsapp`   | (sem assinatura — ver SECURITY.md, gap conhecido)    |

Todos gravam em `eventos_brutos` antes de processar e são **idempotentes** (dedupe
por `eventos_processados`), então reenviar o mesmo evento não duplica.
