-- Migration: tabela log_auditoria (CLAUDE.md).
-- Toda ação de escrita (tools MCP, ações do dashboard, cron) grava aqui:
-- quem (origem), o quê (acao), sobre quem (aluna_id), resultado e quando.
-- Append-only → só created_at/criado_em, sem trigger de updated_at.
-- aluna_id com on delete set null: a auditoria sobrevive à remoção da aluna.

create table if not exists public.log_auditoria (
  id         uuid primary key default gen_random_uuid(),
  origem     text not null check (origem in ('mcp', 'dashboard', 'cron')),
  acao       text not null,
  aluna_id   uuid references public.alunas (id) on delete set null,
  resultado  text not null,
  detalhes   jsonb not null default '{}'::jsonb,
  criado_em  timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.log_auditoria is 'Auditoria de ações de escrita. origem: mcp | dashboard | cron.';

create index if not exists idx_log_auditoria_origem on public.log_auditoria (origem);
create index if not exists idx_log_auditoria_aluna_id on public.log_auditoria (aluna_id);
create index if not exists idx_log_auditoria_criado_em on public.log_auditoria (criado_em);

alter table public.log_auditoria enable row level security;
