-- Migration: tabela alunas (cadastro base — entidade central do projeto).
-- Contém PII (email/telefone) → RLS habilitado (CLAUDE.md).

create table if not exists public.alunas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  email       text,
  telefone    text,
  criado_em   timestamptz not null default now(),
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.alunas is 'Cadastro de alunas — entidade central. criado_em é o marco de negócio; created_at/updated_at são auditoria de linha.';

-- E-mail único quando informado (múltiplos NULLs são permitidos no Postgres).
create unique index if not exists uq_alunas_email
  on public.alunas (email)
  where email is not null;

drop trigger if exists trg_alunas_updated_at on public.alunas;
create trigger trg_alunas_updated_at
  before update on public.alunas
  for each row execute function public.set_updated_at();

-- RLS: sem policies → apenas a service_role (que ignora RLS) acessa.
-- O acesso do app é 100% via servidor com service_role. Policies para o
-- dashboard autenticado entram em sub-fase futura.
alter table public.alunas enable row level security;
