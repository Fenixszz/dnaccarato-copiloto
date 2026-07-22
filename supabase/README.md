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
- **RLS habilitado em todas as tabelas**, sem policies: o acesso é exclusivo do servidor via service role (que ignora RLS). Quando o dashboard/widget precisar de acesso direto do browser, criam-se policies específicas.
- `aluna_id` é **nullable** nas tabelas de eventos (pagamentos, documentos, formulários, reuniões, tasks): o evento pode chegar por webhook antes do matching de nome vincular a aluna. `on delete restrict` impede apagar uma aluna com histórico.
- `pagamentos (origem, referencia_externa)` e `tasks_asana (task_id)` são únicos, permitindo upsert idempotente na ingestão.
- `eventos_processados` é a tabela de dedupe dos webhooks usada por `lib/webhooks/idempotencia.ts`.
