-- Espelho das tasks do Asana vinculadas a alunas.
create table public.tasks_asana (
  id uuid primary key default gen_random_uuid(),
  aluna_id uuid references public.alunas (id) on delete restrict,
  -- Id (gid) da task no Asana.
  task_id text not null unique,
  titulo text not null,
  status text not null,
  concluido_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index idx_tasks_asana_aluna_id on public.tasks_asana (aluna_id);
create index idx_tasks_asana_status on public.tasks_asana (status);

create trigger trg_tasks_asana_atualizado_em
  before update on public.tasks_asana
  for each row
  execute function public.definir_atualizado_em();

alter table public.tasks_asana enable row level security;
