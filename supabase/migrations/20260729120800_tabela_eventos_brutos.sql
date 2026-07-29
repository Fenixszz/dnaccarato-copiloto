-- Migration: tabela eventos_brutos.
-- Log cru de TUDO que chega via webhook, gravado ANTES de processar.
-- Append-only (imutável) → só created_at, sem trigger de updated_at.

create table if not exists public.eventos_brutos (
  id          uuid primary key default gen_random_uuid(),
  origem      text not null,
  payload     jsonb not null,
  recebido_em timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

comment on table public.eventos_brutos is 'Log cru de webhooks recebidos, antes de qualquer processamento. Append-only.';

create index if not exists idx_eventos_brutos_origem on public.eventos_brutos (origem);
create index if not exists idx_eventos_brutos_recebido_em on public.eventos_brutos (recebido_em);

alter table public.eventos_brutos enable row level security;
