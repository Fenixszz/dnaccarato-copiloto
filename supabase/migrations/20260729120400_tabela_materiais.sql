-- Migration: tabela materiais (arquivos da aluna no Google Drive).
-- Sem relação com assinatura (diferente de documentos).
-- Liga a arquivos da aluna → RLS habilitado (CLAUDE.md).

create table if not exists public.materiais (
  id            uuid primary key default gen_random_uuid(),
  aluna_id      uuid not null references public.alunas (id) on delete cascade,
  nome_arquivo  text not null,
  tipo          text,
  link_drive    text,
  adicionado_em timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.materiais is 'Arquivos da aluna no Drive (sem relação com assinatura).';

create index if not exists idx_materiais_aluna_id on public.materiais (aluna_id);

drop trigger if exists trg_materiais_updated_at on public.materiais;
create trigger trg_materiais_updated_at
  before update on public.materiais
  for each row execute function public.set_updated_at();

alter table public.materiais enable row level security;
