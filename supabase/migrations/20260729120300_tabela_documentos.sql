-- Migration: tabela documentos (documentos para assinatura, ex: Autentique).
-- Dado sensível/legal → RLS habilitado (CLAUDE.md).
-- on delete restrict: documento assinado não some junto com a aluna.

create table if not exists public.documentos (
  id                     uuid primary key default gen_random_uuid(),
  aluna_id               uuid not null references public.alunas (id) on delete restrict,
  tipo                   text not null,
  status                 text not null default 'pendente'
                           check (status in ('pendente', 'assinado', 'rejeitado')),
  origem                 text not null default 'autentique',
  documento_id_externo   text,
  assinado_em            timestamptz,
  motivo_rejeicao        text,
  link_assinado          text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table public.documentos is 'Documentos para assinatura. status: pendente | assinado | rejeitado.';

create index if not exists idx_documentos_aluna_id on public.documentos (aluna_id);

-- Idempotência: id externo do documento é único por origem (quando informado).
create unique index if not exists uq_documentos_origem_id_externo
  on public.documentos (origem, documento_id_externo)
  where documento_id_externo is not null;

drop trigger if exists trg_documentos_updated_at on public.documentos;
create trigger trg_documentos_updated_at
  before update on public.documentos
  for each row execute function public.set_updated_at();

alter table public.documentos enable row level security;
