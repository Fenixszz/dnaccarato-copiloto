-- Tokens de acesso ao servidor MCP. Guarda-se só o hash (SHA-256) do token —
-- o valor em claro é mostrado uma única vez na criação e nunca persiste.
create table public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  -- Nome legível de quem usa o token (ex.: 'claude-desktop-joao').
  nome text not null,
  token_hash text not null unique,
  -- Tools MCP que este token pode chamar (vazio = nenhuma).
  escopo text[] not null default '{}',
  status text not null default 'ativo' check (status in ('ativo', 'revogado')),
  revogado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create trigger trg_api_tokens_atualizado_em
  before update on public.api_tokens
  for each row
  execute function public.definir_atualizado_em();

-- Tokens de API: RLS obrigatório (regra do projeto).
alter table public.api_tokens enable row level security;
