-- Migration: tabela eventos_processados (dedupe de webhooks — CLAUDE.md).
-- A idempotência dos webhooks se apoia no UNIQUE(origem, evento_id_externo):
-- o INSERT com conflito nessa chave é o mecanismo atômico de "exactly once".
-- Append-only → só created_at, sem trigger de updated_at.

create table if not exists public.eventos_processados (
  id                 uuid primary key default gen_random_uuid(),
  origem             text not null,
  evento_id_externo  text not null,
  processado_em      timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  constraint uq_eventos_processados_origem_evento
    unique (origem, evento_id_externo)
);

comment on table public.eventos_processados is 'Dedupe de webhooks. UNIQUE(origem, evento_id_externo) garante idempotência.';

alter table public.eventos_processados enable row level security;
