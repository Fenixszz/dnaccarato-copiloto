-- Dedupe de webhooks (regra do projeto: todo webhook é idempotente). A rota
-- consulta (origem, evento_id_externo) ANTES de processar qualquer evento —
-- veja lib/webhooks/idempotencia.ts. O UNIQUE garante a idempotência também
-- a nível de banco: dois processamentos concorrentes do mesmo evento não
-- conseguem registrar duas vezes.
create table public.eventos_processados (
  id uuid primary key default gen_random_uuid(),
  origem text not null,
  -- Id único do evento no sistema de origem.
  evento_id_externo text not null,
  -- Resumo do desfecho do processamento (ex.: 'pagamento atualizado').
  resultado text,
  processado_em timestamptz not null default now(),
  unique (origem, evento_id_externo)
);

alter table public.eventos_processados enable row level security;
