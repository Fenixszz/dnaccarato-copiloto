-- Migration: tabela formularios (respostas de formulários, ex: Google Forms).
-- Respostas podem conter PII → RLS habilitado (CLAUDE.md).

create table if not exists public.formularios (
  id               uuid primary key default gen_random_uuid(),
  aluna_id         uuid not null references public.alunas (id) on delete cascade,
  formulario_nome  text not null,
  respostas        jsonb not null default '{}'::jsonb,
  respondido_em    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.formularios is 'Respostas de formulários da aluna. respostas em JSONB.';

create index if not exists idx_formularios_aluna_id on public.formularios (aluna_id);

drop trigger if exists trg_formularios_updated_at on public.formularios;
create trigger trg_formularios_updated_at
  before update on public.formularios
  for each row execute function public.set_updated_at();

alter table public.formularios enable row level security;
