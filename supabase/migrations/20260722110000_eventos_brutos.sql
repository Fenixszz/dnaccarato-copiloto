-- Log cru de tudo que chega via webhook, gravado ANTES de qualquer
-- processamento. Append-only: nunca se atualiza uma linha daqui (por isso não
-- há atualizado_em); serve pra reprocessar e depurar ingestão.
create table public.eventos_brutos (
  id uuid primary key default gen_random_uuid(),
  origem text not null,
  payload jsonb not null,
  recebido_em timestamptz not null default now()
);

create index idx_eventos_brutos_origem_recebido_em
  on public.eventos_brutos (origem, recebido_em desc);

-- Payload cru pode conter dado pessoal: acesso só pelo servidor.
alter table public.eventos_brutos enable row level security;
