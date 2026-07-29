-- Migration: tabela tasks_asana (tarefas da aluna espelhadas do Asana).
-- RLS habilitado por consistência (acesso só via service_role no servidor).

create table if not exists public.tasks_asana (
  id            uuid primary key default gen_random_uuid(),
  aluna_id      uuid not null references public.alunas (id) on delete cascade,
  task_id       text not null,
  titulo        text not null,
  status        text,
  criado_em     timestamptz,
  concluido_em  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.tasks_asana is 'Tarefas do Asana ligadas à aluna. task_id = id da task no Asana. criado_em/concluido_em refletem o Asana.';

-- task_id é único (id global do Asana) → evita duplicar a mesma task.
create unique index if not exists uq_tasks_asana_task_id on public.tasks_asana (task_id);
create index if not exists idx_tasks_asana_aluna_id on public.tasks_asana (aluna_id);

drop trigger if exists trg_tasks_asana_updated_at on public.tasks_asana;
create trigger trg_tasks_asana_updated_at
  before update on public.tasks_asana
  for each row execute function public.set_updated_at();

alter table public.tasks_asana enable row level security;
