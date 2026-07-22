-- Reuniões agendadas (Calendly, Google Agenda...).
create table public.reunioes (
  id uuid primary key default gen_random_uuid(),
  aluna_id uuid references public.alunas (id) on delete restrict,
  -- Sistema de origem do agendamento (ex.: 'calendly', 'agenda').
  origem text not null,
  data_hora timestamptz not null,
  status text not null,
  link text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index idx_reunioes_aluna_id on public.reunioes (aluna_id);
create index idx_reunioes_data_hora on public.reunioes (data_hora);

create trigger trg_reunioes_atualizado_em
  before update on public.reunioes
  for each row
  execute function public.definir_atualizado_em();

alter table public.reunioes enable row level security;
