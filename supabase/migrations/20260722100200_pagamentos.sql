-- Pagamentos ingeridos via webhook (Asaas etc.). aluna_id é nullable porque o
-- evento pode chegar antes do matching de nome vincular a aluna.
create table public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  aluna_id uuid references public.alunas (id) on delete restrict,
  -- Sistema de origem do registro (ex.: 'asaas').
  origem text not null,
  status text not null,
  valor numeric(10, 2) not null,
  vencimento date,
  pago_em timestamptz,
  -- Id do registro no sistema de origem, pra upsert idempotente.
  referencia_externa text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (origem, referencia_externa)
);

create index idx_pagamentos_aluna_id on public.pagamentos (aluna_id);
create index idx_pagamentos_status on public.pagamentos (status);

create trigger trg_pagamentos_atualizado_em
  before update on public.pagamentos
  for each row
  execute function public.definir_atualizado_em();

-- Dado financeiro: RLS obrigatório (regra do projeto).
alter table public.pagamentos enable row level security;
