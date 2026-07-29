-- Migration: tabela api_tokens (acesso ao servidor MCP).
-- Segurança (CLAUDE.md): guardamos APENAS o hash do token, nunca o valor cru.
-- escopo = array de tools MCP permitidas. Mutável (status/uso) → updated_at.

create table if not exists public.api_tokens (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,                 -- rótulo humano do token
  token_hash    text not null,                 -- SHA-256 do token (nunca o token cru)
  escopo        text[] not null default '{}',  -- tools MCP permitidas
  status        text not null default 'ativo'
                  check (status in ('ativo', 'revogado')),
  ultimo_uso_em timestamptz,
  expira_em     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint uq_api_tokens_token_hash unique (token_hash)
);

comment on table public.api_tokens is 'Tokens de acesso ao MCP. Armazena só o hash; escopo = tools permitidas.';
comment on column public.api_tokens.token_hash is 'SHA-256 do token. O valor cru nunca é persistido.';
comment on column public.api_tokens.escopo is 'Array de nomes de tools MCP que este token pode chamar.';

create index if not exists idx_api_tokens_status on public.api_tokens (status);

drop trigger if exists trg_api_tokens_updated_at on public.api_tokens;
create trigger trg_api_tokens_updated_at
  before update on public.api_tokens
  for each row execute function public.set_updated_at();

alter table public.api_tokens enable row level security;
