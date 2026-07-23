-- Alertas de falha do sistema (envio pela Evolution que esgotou as
-- tentativas, etc.). Append-only: cada falha é uma linha, ninguém edita.
create table public.falhas_sistema (
  id uuid primary key default gen_random_uuid(),
  -- Onde ocorreu: 'briefing', 'whatsapp'...
  area text not null,
  -- O que estava tentando fazer (sem dado sensível).
  contexto text,
  erro text not null,
  severidade text not null default 'alta',
  criado_em timestamptz not null default now()
);

create index idx_falhas_sistema_criado_em on public.falhas_sistema (criado_em desc);

alter table public.falhas_sistema enable row level security;
