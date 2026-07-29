-- Migration: tabela pagamentos (cobranças/pagamentos, ex: Asaas).
-- Dado financeiro sensível → RLS habilitado (CLAUDE.md).
-- on delete restrict: registro financeiro não some junto com a aluna.

create table if not exists public.pagamentos (
  id                  uuid primary key default gen_random_uuid(),
  aluna_id            uuid not null references public.alunas (id) on delete restrict,
  origem              text not null,
  status              text not null,
  valor               numeric(12, 2) not null,
  vencimento          date,
  pago_em             timestamptz,
  referencia_externa  text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.pagamentos is 'Pagamentos/cobranças da aluna. origem = sistema de origem (ex: asaas).';

create index if not exists idx_pagamentos_aluna_id on public.pagamentos (aluna_id);

-- Idempotência de ingestão: uma referência externa é única por origem.
create unique index if not exists uq_pagamentos_origem_referencia
  on public.pagamentos (origem, referencia_externa)
  where referencia_externa is not null;

drop trigger if exists trg_pagamentos_updated_at on public.pagamentos;
create trigger trg_pagamentos_updated_at
  before update on public.pagamentos
  for each row execute function public.set_updated_at();

alter table public.pagamentos enable row level security;
