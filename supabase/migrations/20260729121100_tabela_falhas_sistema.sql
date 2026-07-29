-- Migration: tabela falhas_sistema.
-- Registro de falhas operacionais: envio de WhatsApp, cron não disparado,
-- erro de billing, etc. Tem severidade e ciclo de resolução.
-- Mutável (resolvido/resolvido_em) → tem updated_at via trigger.

create table if not exists public.falhas_sistema (
  id           uuid primary key default gen_random_uuid(),
  tipo         text not null,             -- ex: whatsapp_envio | cron_nao_disparado | billing
  severidade   text not null default 'media'
                 check (severidade in ('baixa', 'media', 'alta', 'critica')),
  mensagem     text not null,
  contexto     jsonb not null default '{}'::jsonb,
  resolvido    boolean not null default false,
  resolvido_em timestamptz,
  ocorrido_em  timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.falhas_sistema is 'Falhas operacionais (envio WhatsApp, cron, billing...) com severidade e resolução.';

create index if not exists idx_falhas_sistema_severidade on public.falhas_sistema (severidade);
create index if not exists idx_falhas_sistema_resolvido on public.falhas_sistema (resolvido);
create index if not exists idx_falhas_sistema_ocorrido_em on public.falhas_sistema (ocorrido_em);

drop trigger if exists trg_falhas_sistema_updated_at on public.falhas_sistema;
create trigger trg_falhas_sistema_updated_at
  before update on public.falhas_sistema
  for each row execute function public.set_updated_at();

alter table public.falhas_sistema enable row level security;
