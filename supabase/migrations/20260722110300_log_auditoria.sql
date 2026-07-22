-- Auditoria de toda ação de escrita (regra do projeto): quem fez, o quê,
-- quando e o resultado. Append-only — nunca se edita auditoria.
create table public.log_auditoria (
  id uuid primary key default gen_random_uuid(),
  -- Quem executou a ação.
  origem text not null check (origem in ('mcp', 'dashboard', 'cron')),
  -- O que foi feito (ex.: 'marcar_pagamento_pago').
  acao text not null,
  aluna_id uuid references public.alunas (id) on delete restrict,
  resultado text not null,
  -- Contexto extra da ação (sem dado sensível nem segredo).
  detalhes jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

create index idx_log_auditoria_aluna_id on public.log_auditoria (aluna_id);
create index idx_log_auditoria_criado_em on public.log_auditoria (criado_em desc);

alter table public.log_auditoria enable row level security;
