# Migrations do banco (Supabase)

Migrations SQL em `migrations/`, em ordem de aplicação (prefixo timestamp).

## Como aplicar

**Via Supabase CLI** (recomendado — mantém o histórico de quais migrations já rodaram):

```bash
npx supabase login
npx supabase link --project-ref <ref-do-projeto>   # ref visível na URL do painel
npx supabase db push
```

**Via SQL Editor do painel** (alternativa manual): cole e execute o conteúdo de cada arquivo **na ordem dos nomes**, começando por `20260722100000_funcao_atualizado_em.sql` (as demais dependem da função e da tabela `alunas`).

## Decisões de schema

- Todas as tabelas têm `criado_em` (default `now()`) e `atualizado_em` mantido automaticamente pelo trigger `definir_atualizado_em` em todo UPDATE. Nomes em português conforme o CLAUDE.md.
- **RLS habilitado em todas as tabelas.** Modelo de acesso: escrita só pela service role (webhooks, MCP, cron — ela tem BYPASSRLS; a ausência de policies de escrita garante que mais ninguém escreve). Usuários autenticados do dashboard têm policies de **leitura** em `pagamentos`, `documentos`, `api_tokens` e `log_auditoria`; as demais tabelas ainda não têm policy nenhuma (browser não lê).
- **Foreign keys revisadas**: todas as 7 FKs `aluna_id` são `ON DELETE RESTRICT`, de propósito. Nunca CASCADE em dado de pagamento/documento; e SET NULL foi descartado porque órfão silencioso esconde furo — apagar uma aluna exige tratar o histórico explicitamente antes.
- **Busca normalizada**: as funções SQL `normalizar_texto` (lower + sem acento, espelha `lib/matching/nomes.ts`) e `normalizar_telefone` (só dígitos) sustentam índices de expressão em `alunas.nome`, `alunas.email` e `alunas.telefone`. As queries de busca/matching devem usar essas mesmas funções pra aproveitar os índices.
- `aluna_id` é **nullable** nas tabelas de eventos (pagamentos, documentos, formulários, reuniões, tasks): o evento pode chegar por webhook antes do matching de nome vincular a aluna. `on delete restrict` impede apagar uma aluna com histórico.
- `pagamentos (origem, referencia_externa)` e `tasks_asana (task_id)` são únicos, permitindo upsert idempotente na ingestão.
- `eventos_processados` é a tabela de dedupe dos webhooks usada por `lib/webhooks/idempotency.ts`; o `UNIQUE (origem, evento_id_externo)` garante a idempotência também a nível de banco.
- Tabelas de log (`eventos_brutos`, `briefings_enviados`, `log_auditoria`) são **append-only**: não têm `atualizado_em` nem trigger, porque linha de log não se edita.
- `api_tokens` guarda **só o hash** do token (`token_hash`), nunca o valor em claro; escopo é um array das tools MCP permitidas.
- `briefings_enviados.chave_alerta` é única: é o identificador determinístico que impede reenviar o mesmo alerta no WhatsApp.
