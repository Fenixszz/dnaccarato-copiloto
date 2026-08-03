-- Migration: materiais.referencia_externa (dedupe por id do arquivo no Drive)
-- e tabela estado_integracoes (guarda o pageToken do Drive changes, etc).

-- Dedupe de materiais pelo id do arquivo no Drive.
alter table public.materiais add column if not exists referencia_externa text;
comment on column public.materiais.referencia_externa is
  'Id externo do arquivo na origem (ex: fileId do Google Drive). Dedupe.';
create unique index if not exists uq_materiais_referencia_externa
  on public.materiais (referencia_externa)
  where referencia_externa is not null;

-- Estado de integrações: key-value para cursores/tokens (ex: pageToken do Drive).
create table if not exists public.estado_integracoes (
  chave      text primary key,
  valor      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.estado_integracoes is
  'Estado/cursores de integrações (ex: drive_page_token). Acesso só via service_role.';

drop trigger if exists trg_estado_integracoes_updated_at on public.estado_integracoes;
create trigger trg_estado_integracoes_updated_at
  before update on public.estado_integracoes
  for each row execute function public.set_updated_at();

alter table public.estado_integracoes enable row level security;
