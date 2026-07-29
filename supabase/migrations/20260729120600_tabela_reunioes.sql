-- Migration: tabela reunioes (agendamentos, ex: Calendly / Google Agenda).
-- RLS habilitado por consistência (acesso só via service_role no servidor).

create table if not exists public.reunioes (
  id          uuid primary key default gen_random_uuid(),
  aluna_id    uuid not null references public.alunas (id) on delete cascade,
  origem      text not null,
  data_hora   timestamptz,
  status      text,
  link        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.reunioes is 'Reuniões/agendamentos da aluna. origem = sistema (ex: calendly).';

create index if not exists idx_reunioes_aluna_id on public.reunioes (aluna_id);

drop trigger if exists trg_reunioes_updated_at on public.reunioes;
create trigger trg_reunioes_updated_at
  before update on public.reunioes
  for each row execute function public.set_updated_at();

alter table public.reunioes enable row level security;
