-- Migration: tabela briefings_enviados.
-- Histórico do que foi mandado no WhatsApp (briefing diário e afins).
-- Append-only → só created_at, sem trigger de updated_at.

create table if not exists public.briefings_enviados (
  id         uuid primary key default gen_random_uuid(),
  destino    text not null,               -- número/identificador de quem recebeu
  canal      text not null default 'whatsapp',
  conteudo   text not null,               -- corpo enviado
  status     text not null default 'enviado',
  enviado_em timestamptz not null default now(),
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.briefings_enviados is 'Histórico de briefings enviados (WhatsApp). Append-only.';

create index if not exists idx_briefings_enviados_enviado_em on public.briefings_enviados (enviado_em);

alter table public.briefings_enviados enable row level security;
