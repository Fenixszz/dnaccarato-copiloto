-- Documentos das alunas (contratos, termos) acompanhados no Drive.
create table public.documentos (
  id uuid primary key default gen_random_uuid(),
  aluna_id uuid references public.alunas (id) on delete restrict,
  tipo text not null,
  status text not null default 'pendente' check (status in ('pendente', 'assinado')),
  assinado_em timestamptz,
  link_drive text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index idx_documentos_aluna_id on public.documentos (aluna_id);
create index idx_documentos_status on public.documentos (status);

create trigger trg_documentos_atualizado_em
  before update on public.documentos
  for each row
  execute function public.definir_atualizado_em();

-- Documento é dado sensível: RLS obrigatório (regra do projeto).
alter table public.documentos enable row level security;
