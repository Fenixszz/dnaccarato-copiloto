-- Alunas do programa: entidade central que as demais tabelas referenciam.
create table public.alunas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text,
  telefone text,
  -- Dados extras sem coluna própria (ex.: apelidos usados em outros sistemas,
  -- observações de matching). Nunca guardar segredo ou credencial aqui.
  metadata jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create trigger trg_alunas_atualizado_em
  before update on public.alunas
  for each row
  execute function public.definir_atualizado_em();

-- Dados pessoais (nome, e-mail, telefone): acesso só pelo servidor (service
-- role). Sem policies, anon/authenticated não leem nada.
alter table public.alunas enable row level security;
