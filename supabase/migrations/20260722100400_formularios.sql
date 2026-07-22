-- Respostas de formulários (Google Forms) preenchidos pelas alunas.
create table public.formularios (
  id uuid primary key default gen_random_uuid(),
  aluna_id uuid references public.alunas (id) on delete restrict,
  formulario_nome text not null,
  respostas jsonb not null default '{}'::jsonb,
  respondido_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index idx_formularios_aluna_id on public.formularios (aluna_id);

create trigger trg_formularios_atualizado_em
  before update on public.formularios
  for each row
  execute function public.definir_atualizado_em();

-- Respostas podem conter dado pessoal e de saúde: acesso só pelo servidor.
alter table public.formularios enable row level security;
